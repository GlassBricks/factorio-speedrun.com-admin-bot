/** @typedef {import("./src/config.ts").Config} Config */

const moreInfoDescription =
  "More info: https://discord.com/channels/260103071017730048/390245480036040704/1311861862459244565 Option 2"
const reelectDescription =
  `this initiates a no-confidence vote.
If the no-confidence vote is initiated and receives a 2/3 majority, the current admin team is dismissed and reelections are held.\n\n` +
  moreInfoDescription

/** @type {Config} */
const config = {
  botName: "Factorio SRC admin bot",
  voteInitiateCommands: [
    {
      id: "initiate_no_confidence_vote",
      guildIds: ["260103071017730048"],
      idHints: ["1315074989916946556"],

      commandName: "initiate_no_confidence_vote",
      commandDescription: "Initiate a no-confidence vote",

      confirmationMessage:
        `Are you sure you want to begin initiating a no-confidence vote?
A message will be created in %c. If %n reacts are received within %h hours, ` + reelectDescription,

      alreadyRunningMessage: "There is already an active initiation message here: ",

      postChannelId: "1313654063526580255",
      postNotifyRoles: ["316699796276641792"],
      postMessage:
        `**No-confidence vote initiation**
If %n %r reacts are received %e, ` + reelectDescription,

      reaction: "❌",
      reactsRequired: 10,
      durationHours: 24 * 3,

      passedNotifyRoles: ["316699796276641792"],
      failedMessage:
        "**No-confidence vote initiation**\n*Failed: did not get enough reacts by %e.*\n\n" + moreInfoDescription,
      passedMessage: "A no-confidence vote has been initiated.\n<@&1201289542200733766> please set up the vote.",
    },
  ],
  autoReact: [
    {
      onBotMention: false,
      users: ["204512563197640704"],
      channels: ["1204051483872727150"],
      regex: "\\d+\\.\\d+\\.\\d+",
      reactions: ["🤖", "🎉"],
    },
    {
      onBotMention: false,
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
