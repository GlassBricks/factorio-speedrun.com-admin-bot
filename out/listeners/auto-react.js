import { container, Events, Listener } from "@sapphire/framework";
import config from "../config-file.js";
export class AutoReactListener extends Listener {
    config;
    constructor(context) {
        super(context, {
            event: Events.PreMessageParsed,
            enabled: config.autoReact !== undefined && config.autoReact.length > 0,
        });
        this.config =
            config.autoReact?.map((entry) => ({
                ...entry,
                regexpCompiled: new RegExp(entry.regex, "i"),
            })) ?? [];
    }
    async run(message) {
        const content = message.content;
        const userId = message.author;
        const channelId = message.channelId;
        const botMentioned = content.includes(`<@${this.container.client.user.id}>`);
        for (const { onBotMention, users, channels, regexpCompiled, reactions } of this.config) {
            if (onBotMention && !botMentioned)
                continue;
            if (users && !users.includes(userId.id))
                continue;
            if (channels && !channels.includes(channelId))
                continue;
            if (!regexpCompiled.test(message.content))
                continue;
            container.logger.debug("AutoReactListener", "Reacting", reactions, "to message", message.id, "from", userId.id, "in", channelId);
            for (const reaction of reactions) {
                await message.react(reaction);
            }
            break;
        }
    }
}
//# sourceMappingURL=auto-react.js.map