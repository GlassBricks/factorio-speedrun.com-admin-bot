const GuildID = "1313690532953853992"
const Channels = {
  General: "1313690533406703739",
  NotGeneral: "1314039140169420830",
}
const Roles = {
  Notif: "1314038714153828392",
}

/** @typedef {import("./src/config-file.ts").Config} Config */
/** @type {Config} */
const config = {
  botName: "SRC Admin Team",
  announceCommand: {
    guildIds: [GuildID],

    announceToCommandName: "announce_to",
    announceToDescription: `Send a message to #src-announcements as the bot. Use 2 spaces for a newline.`,
    // announceToIdHint: ["1316945027116564564"],

    announceCommandName: "announce",
    announceDescription: "Send a message to a specified channel as the bot. Use 2 spaces for a newline.",
    // announceIdHint: ["1320472656222617662"],

    // requiredRoles: [Roles.SrcAdmin],
    announceChannelId: Channels.SrcAnnouncements,
    auditLogChannelId: Channels.TranscriptsAndLogs,
  },
  messageRelay: [
    {
      fromChannelId: Channels.General,
      toChannelId: Channels.NotGeneral,
      dmMessage: "You sent a message to %f; this was relayed to the SRC Admin Team.\n%m",
      relayMessage: "%u:\n%m",
    },
  ],
  announceNewFactorioVersion: {
    channelId: Channels.NotGeneral,
    cronSchedule: "*/15 * * * *",
  },
  announceSrcSubmissions: {
    channelId: Channels.NotGeneral,
    games: [
      {
        id: "9d35xw1l",
        nickname: "⚙️ Factorio",
      },
      {
        id: "ldewr7ed",
        nickname: "🚀 Space Age",
      },
    ],
    cronSchedule: "*/15 * * * *",
    announceNewPlayersMessage: {
      message: `🎉 **%p** had their first verified run! Notif: <@&${Roles.Notif}>.`,
      allowedMentions: {
        roles: [Roles.Notif],
      },
    },
  },
  autoReact: [
    {
      onBotMention: true,
      users: ["691597162705977405"],
      regex: "apple|banana",
      reactions: ["🍌"],
    },
    {
      onBotMention: true,
      regex: "apple|banana",
      reactions: ["🍎"],
    },
  ],
}
export default config
