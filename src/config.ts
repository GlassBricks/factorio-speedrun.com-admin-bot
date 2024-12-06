import { Config } from "./config-type.js"

const config: Config =  {
  voteInitiateCommands: [
    {
      id: "test",
      guildId: "1313690532953853992",

      commandName: "test_vote_of_stuff",
      commandDescription: "Testing the vote of no-confidence command",
      confirmDescription: `Are you sure you want to initiate a banana-ban?
If %n reacts are received within %h hours, a banana-ban vote will be initiated.`,
      postChannelId: "1314039140169420830",
      postMessage: `Someone has initiated a banana-ban.
If %n reacts are received %e, we will initiate a banana-ban vote.`,
      postNotifyRoles: ["1314038714153828392"],

      reaction: "🍎",
      reactsRequired: 2,
      durationHours: 0.1 / 60,

      passedMessage: "Banana ban bananza!",
      passedNotifyRoles: ["1314038771825508372"],

      failedMessage: "Did not get enough reacts since %e",
    },
  ],
}
export default config
