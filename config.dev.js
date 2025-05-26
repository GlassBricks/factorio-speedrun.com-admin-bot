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
  announcementRelay: [
    {
      fromChannelId: Channels.NotGeneral,
      toChannelId: Channels.General,
      confirmReact: "📣",
    },
  ],
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
