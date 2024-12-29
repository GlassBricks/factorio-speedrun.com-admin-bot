const GuildID = "260103071017730048"
const Roles = {
  SrcAdmin: "1201289542200733766",
  Speedrunner: "316699796276641792",
}
const Channels = {
  SrcAnnouncements: "1313654063526580255",
  TranscriptsAndLogs: "1313648404232015892",
  SrcDiscussionContact: "1313675268392489053",
  FeedbackRelay: "1322336566705655838",
  RunAdministration: "1201292109332885584",
}

const moreInfoDescription =
  "More info: https://discord.com/channels/260103071017730048/390245480036040704/1311861862459244565 Option 2"
const reelectDescription =
  `this initiates a no-confidence vote.
If the no-confidence vote is initiated and receives a 2/3 majority, the current admin team is dismissed and reelections are held.\n\n` +
  moreInfoDescription

/** @typedef {import("./src/config.ts").Config} Config */
/** @type {Config} */
const config = {
  botName: "SRC Admin Team",
  announceCommand: {
    guildIds: [GuildID],

    announceToCommandName: "announce_to",
    announceToDescription: `Send a message to #src-announcements as the bot. Use 2 spaces for a newline.`,
    announceToIdHint: ["1316945027116564564"],

    announceCommandName: "announce",
    announceDescription: "Send a message to a specified channel as the bot. Use 2 spaces for a newline.",
    announceIdHint: ["1320472656222617662"],

    requiredRoles: [Roles.SrcAdmin],
    announceChannelId: Channels.SrcAnnouncements,
    auditLogChannelId: Channels.TranscriptsAndLogs,
  },
  voteInitiateCommands: [
    {
      id: "initiate_no_confidence_vote",
      guildIds: [GuildID],
      idHints: ["1315074989916946556"],

      commandName: "initiate_no_confidence_vote",
      commandDescription:
        "Initiate a no-confidence vote. Run the command for more info (it will show a confirmation message).",

      confirmationMessage:
        `Are you sure you want to begin initiating a no-confidence vote?
A message will be created in %c. If %n reacts are received within %h hours, ` + reelectDescription,

      alreadyRunningMessage: "There is already an active initiation message here: ",

      postChannelId: Channels.SrcAnnouncements,
      postNotifyRoles: [Roles.Speedrunner],
      postMessage:
        `**No-confidence vote initiation**
If %n %r reacts are received %e, ` + reelectDescription,

      reaction: "❌",
      reactsRequired: 10,
      durationHours: 24 * 3,

      passedNotifyRoles: [Roles.Speedrunner],
      failedMessage:
        "**No-confidence vote initiation**\n*Failed: did not get enough reacts by %e.*\n\n" + moreInfoDescription,
      passedMessage: `A no-confidence vote has been initiated.
<@&${Roles.SrcAdmin}> please set up the vote.`,
    },
  ],
  messageRelay: [
    {
      fromChannelId: Channels.SrcDiscussionContact,
      toChannelId: Channels.FeedbackRelay,
      dmMessage: "You sent a message to %f; this was relayed to the SRC Admin Team.\n%m",
      relayMessage: "%u:\n%m",
    },
  ],
  announceNewFactorioVersion: {
    channelId: Channels.RunAdministration,
    cronSchedule: "*/15 * * * *",
  },
  announceSrcSubmissions: {
    channelId: Channels.RunAdministration,
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
    announceNewPlayersMessage: `🎉 **%p** had their first verified run! Consider giving them the <@&${Roles.Speedrunner}> role.\n<@&${Roles.SrcAdmin}>`,
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
