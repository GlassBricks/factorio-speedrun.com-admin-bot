var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MessageRelayListener_1;
import { Events, Listener } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import config from "../config-file.js";
let MessageRelayListener = class MessageRelayListener extends Listener {
    static { MessageRelayListener_1 = this; }
    static relayMap = new Map(config.messageRelay?.map((c) => [c.fromChannelId, c]));
    async run(message) {
        if (message.author.bot)
            return; // Ignore bot messages
        const relayConfig = MessageRelayListener_1.relayMap.get(message.channelId);
        if (!relayConfig)
            return;
        await this.runForMessage(message, relayConfig);
    }
    async runForMessage(message, relayConfig) {
        const originalContent = message.content;
        const formatMessage = (template) => template
            .replace("%f", `<#${relayConfig.fromChannelId}>`)
            .replace("%t", `<#${relayConfig.toChannelId}>`)
            .replace("%u", `<@${message.author.id}>`)
            .replace("%m", originalContent);
        await Promise.all([
            relayConfig.dmMessage && message.author.send(formatMessage(relayConfig.dmMessage)),
            message.delete().catch(async () => {
                await message.channel.send("Bot does not have permission to manage messages in the relay channel. Please contact an admin!");
            }),
        ]);
        const toChannelId = relayConfig.toChannelId;
        const toChannel = await message.guild?.channels.fetch(toChannelId);
        if (!toChannel || !toChannel.isTextBased()) {
            await message.channel.send("Specified relay channel does not exist or is not a text channel! Please contact an admin!");
            return;
        }
        await toChannel.send({
            content: formatMessage(relayConfig.relayMessage),
            allowedMentions: { parse: [] },
        });
    }
};
MessageRelayListener = MessageRelayListener_1 = __decorate([
    ApplyOptions({
        event: Events.MessageCreate,
        enabled: config.messageRelay && config.messageRelay?.length > 0,
    })
], MessageRelayListener);
export { MessageRelayListener };
//# sourceMappingURL=message-relay.js.map