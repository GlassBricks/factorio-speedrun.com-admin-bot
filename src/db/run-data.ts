export interface RunData {
  gameId: string
  gameName: string
  categoryName: string
  players: string[]
  time: string
  place: number | undefined
  isChallengerRun: boolean
  firstTimeSubmissionPlayers: string[]
}

export enum SrcRunStatus {
  New = 0,
  Verified = 1,
  Rejected = 2,
  SelfVerified = 3,
  Unknown = 37,
}
