/** @typedef {import("./src/config.d.ts").Config} Config */

/** @type {Config} */
const config = {
  botName: "Factorio SRC admin bot",
  voteInitiateCommands: [
    {
      id: "initiate_no_confidence_vote",
      guildIds: ["260103071017730048"],
      idHints: ["1315074989916946556"],

      commandName: "initiate_no_confidence_vote",
      commandDescription: "Testing vote initiate command",

      confirmationMessage: `Are you sure you want to initiate a banana-ban vote?
A message will be created. If %n reacts are received within %h hours, a banana-ban vote will be initiated.`,

      alreadyRunningMessage: "There is already an active message here: ",

      postChannelId: "1309961515516039238",
      postNotifyRoles: ["316699796276641792"],
      postMessage: `A banana-ban has been initiated.
If %n %r reacts are received %e, we will ban all bananas.`,

      reaction: "🍎",
      reactsRequired: 2,
      durationHours: 1 / 60,

      passedNotifyRoles: ["1201289542200733766"],
      passedMessage: "Banana ban bananza. Skip the vote, all hail our new apple overlords.",

      failedMessage: "A banana ban has been initiated.\nDid not get enough reacts by %e.",
    },
  ],
}
export default config
