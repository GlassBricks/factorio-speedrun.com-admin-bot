import { Command } from "@sapphire/framework";
// noinspection JSUnusedGlobalSymbols
export class PingCommand extends Command {
    constructor(ctx, options) {
        super(ctx, {
            name: "ping",
            description: "Test if the bot is still alive",
            ...options,
        });
    }
    async messageRun(message) {
        this.container.logger.debug("PingCommand", "Received message:", message.content);
        const reply = await message.reply({
            content: "I'm alive!",
        });
        const ping = Math.round(this.container.client.ws.ping);
        const diff = reply.createdTimestamp - message.createdTimestamp;
        return reply.edit(`I'm alive! (Round trip: ${diff}ms. Heartbeat: ${ping}ms.)`);
    }
}
//# sourceMappingURL=ping.js.map