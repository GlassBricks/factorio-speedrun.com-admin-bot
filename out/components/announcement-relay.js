import { AnnounceMessage } from "../db/index.js";
import { Events } from "@sapphire/framework";
import { createLogger } from "../logger.js";
class AnnouncementRelay {
    config;
    logger;
    constructor(config) {
        this.config = config;
        this.logger = createLogger(`AnnouncementRelay(${config.fromChannelId})`);
    }
    async onReactAdded(reaction, user) {
        if (user.bot ||
            reaction.message.channelId !== this.config.fromChannelId ||
            reaction.emoji.name !== this.config.confirmReact)
            return;
        const existingDbMessage = await AnnounceMessage.findOne({ where: { srcMessageId: reaction.message.id } });
        if (existingDbMessage && (await this.editAnnounceMessage(reaction.message, existingDbMessage))) {
            return;
        }
        await this.createAnnounceMessage(reaction.message, user);
    }
    async onMessageEdit(message) {
        if (message.channelId !== this.config.fromChannelId)
            return;
        const existingDbMessage = await AnnounceMessage.findOne({ where: { srcMessageId: message.id } });
        if (existingDbMessage) {
            await this.editAnnounceMessage(message, existingDbMessage);
            return;
        }
        message = await message.fetch();
        if (message.channelId === this.config.fromChannelId &&
            (message.reactions.resolve(this.config.confirmReact)?.count ?? 0) > 0) {
            await this.createAnnounceMessage(message, message.author);
        }
    }
    async onMessageDelete(message) {
        const existingDbMessage = await AnnounceMessage.findOne({ where: { srcMessageId: message.id } });
        if (existingDbMessage) {
            await this.deleteAnnouncement(message, existingDbMessage);
        }
    }
    async deleteAnnouncement(message, dbMessage) {
        this.logger.info("Deleting announcement for message:", message.id);
        const channel = await this.getChannel(message.guild, dbMessage.dstChannelId);
        const dstMessage = await channel.messages.fetch(dbMessage.dstMessageId).catch(() => undefined);
        if (dstMessage && (await dstMessage?.delete())) {
            this.runCatching(message.author?.send(`Deleted announcement: ${dstMessage.url}`));
        }
        await dbMessage.destroy();
    }
    async createAnnounceMessage(message, user) {
        this.logger.info("Creating announcement for message:", message.id);
        const srcMessage = await message.fetch();
        this.runCatching(srcMessage.react(this.config.announcedReact));
        const dstChannel = await this.getChannel(srcMessage.guild, this.config.toChannelId);
        const dstMessage = await dstChannel.send({
            content: srcMessage.content,
            files: Array.from(srcMessage.attachments.values()),
        });
        const dbMessage = new AnnounceMessage({
            srcMessageId: srcMessage.id,
            dstMessageId: dstMessage.id,
            dstChannelId: dstChannel.id,
        });
        await dbMessage.save();
        void user.send({ content: `Created announcement: ${dstMessage.url}` });
    }
    async editAnnounceMessage(message, existingMessage) {
        this.logger.info("Editing announcement for message:", message.id);
        const srcMessage = await message.fetch();
        const dstChannel = await this.getChannel(srcMessage.guild, this.config.toChannelId);
        const dstMessage = await dstChannel.messages.fetch(existingMessage.dstMessageId).catch(() => undefined);
        if (!dstMessage) {
            this.logger.warn("Announcement message not found! Deleting from db:", existingMessage.dstMessageId);
            this.runCatching(srcMessage.author.send("Failed to edit, announcement message not found! Was the announcement deleted?\n" +
                `Re-react with ${this.config.confirmReact} to create a new announcement.`));
            await existingMessage.destroy();
            return false;
        }
        if (srcMessage.content === dstMessage.content) {
            return true;
        }
        await dstMessage.edit(srcMessage.content);
        this.runCatching(srcMessage.author.send(`Edited announcement: ${dstMessage.url}`));
        return true;
    }
    async getChannel(guild, channelId) {
        if (!guild) {
            throw new Error("Not in a guild?");
        }
        const dstChannel = await guild.channels.fetch(channelId);
        if (!dstChannel || !dstChannel.isSendable()) {
            throw new Error(`Destination is not a sendable text channel: ${channelId}`);
        }
        return dstChannel;
    }
    runCatching(promise) {
        if (promise)
            promise.catch((e) => this.logger.error(e));
    }
}
export function setUpAnnouncementRelay(client, config) {
    const handler = new AnnouncementRelay(config);
    function runCatching(promise, getUser) {
        promise.catch(async (e) => {
            handler.logger.error("Error in announcement relay:", e);
            const user = await getUser();
            if (user) {
                user.send("An error occurred! Please report this to the devs if you think this is a mistake!!").catch((err) => {
                    handler.logger.error("Failed to send error message to user:", err);
                });
            }
        });
    }
    client.on(Events.MessageReactionAdd, (reaction, user) => {
        runCatching(handler.onReactAdded(reaction, user), () => user);
    });
    client.on(Events.MessageUpdate, (_, newMessage) => {
        runCatching(handler.onMessageEdit(newMessage), async () => !newMessage.partial ? newMessage.author : (await newMessage.fetch()).author);
    });
    client.on(Events.MessageDelete, (message) => {
        runCatching(handler.onMessageDelete(message), async () => !message.partial ? message.author : (await message.fetch()).author);
    });
}
//# sourceMappingURL=announcement-relay.js.map