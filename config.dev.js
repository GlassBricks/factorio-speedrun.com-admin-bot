const Channels = {
  General: "1313690533406703739",
  NotGeneral: "1314039140169420830",
  Discuss: "1377109913255542906",
}
const Roles = {
  Notif: "1314038714153828392",
  Discusser: "1377107888887304283",
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
    games: [{ id: "9d35xw1l" }, { id: "ldewr7ed" }],
    cronSchedule: "*/15 * * * *",
    announceNewPlayersMessage: {
      message: `🎉 **%p** had their first verified run! <@&${Roles.Notif}>.`,
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
  discussionModeration: {
    logChannelId: Channels.NotGeneral,

    acceptRequiredRoles: [Roles.Notif],
    acceptChannel: Channels.Discuss,
    grantRoleId: Roles.Discusser,

    reportRequiredRoles: [Roles.Discusser, Roles.Notif],
    reportableChannels: [Channels.Discuss],
    reportPeriodHours: 8,
    reportsTempBanThreshold: 2,

    tempBanDays: 1 / 24 / 60, // 1 minute
    tempBanNotify: [Roles.Notif],
  },
}
export default config
