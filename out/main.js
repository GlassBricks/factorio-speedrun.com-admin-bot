import { Events, GatewayIntentBits, Partials } from "discord.js";
import { config as dotEnvConfig } from "dotenv";
import { LogLevel, SapphireClient } from "@sapphire/framework";
import "@sapphire/plugin-logger/register";
import { syncDatabase } from "./db/migrate.js";
import config from "./config-file.js";
import { setUpVoteInitiateCommand } from "./components/vote-initiate.js";
import { setUpAnnounceFactorioVersion } from "./components/announce-factorio-version.js";
import { setUpAnnounceSrcSubmissions } from "./components/announce-src-submissions.js";
import { setUpAnnouncementRelay } from "./components/announcement-relay.js";
import { setUpThreadInactivityMonitor } from "./components/thread-inactivity-monitor.js";
dotEnvConfig();
const dev = process.env.NODE_ENV === "development";
const client = new SapphireClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.User, Partials.Reaction, Partials.Channel, Partials.Message],
    loadDefaultErrorListeners: true,
    loadMessageCommandListeners: true,
    logger: {
        level: dev ? LogLevel.Debug : LogLevel.Info,
    },
});
client.once(Events.ClientReady, (client) => {
    client.logger.info("Bot is ready");
    if (config.botName) {
        client.user.setUsername(config.botName).catch((error) => client.logger.error("Failed to set bot name", error));
    }
});
for (const a of config.announcementRelay ?? []) {
    setUpAnnouncementRelay(client, a);
}
setUpVoteInitiateCommand(client, config.voteInitiateCommands);
setUpAnnounceFactorioVersion(client, config.announceNewFactorioVersion);
setUpAnnounceSrcSubmissions(client, config.announceSrcSubmissions);
setUpThreadInactivityMonitor(client, config.threadInactivityMonitor);
await syncDatabase(client.logger);
client.on("applicationCommandRegistriesRegistered", () => {
    for (const [name, command] of client.application?.commands.cache ?? []) {
        console.log(name, command.name);
    }
});
await client.login(process.env.DISCORD_TOKEN);
//# sourceMappingURL=main.js.map