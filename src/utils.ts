import { Channel, Client, GuildChannel, Message, PermissionFlagsBits } from "discord.js"
import {
  get,
  Paginated,
  PaginatedData,
  PaginatedGetOptions,
  PaginatedParams,
  rawHTTP,
  Run,
  RunsParams,
  RunsResponse,
} from "src-ts"
import { SrcRunStatus } from "./db/index.js"
import { Duration } from "iso8601-duration"

export async function botCanSendInChannel(channel: Channel): Promise<boolean> {
  return (
    channel.isTextBased() &&
    channel.isSendable() &&
    (channel instanceof GuildChannel
      ? channel
          .permissionsFor(await channel.guild.members.fetchMe())
          .has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)
      : true)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function paginatedGetUntilMapNone<T extends Paginated<any>, S = PaginatedData<T>>(
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryParams?: PaginatedParams & Record<string, any>,
  options: PaginatedGetOptions<PaginatedData<T>, S> = {},
): Promise<Exclude<Awaited<S>, undefined>[]> {
  const { max, map, ...getOpts } = options
  const { ...httpOpts } = getOpts
  const data: Exclude<Awaited<S>, undefined>[] = []
  let next, response: T

  if (max && max < 1) return []
  if (!map) throw new Error("Map must be supplied")

  do {
    response = next ? await rawHTTP<T>(next, "get", httpOpts) : await get<T>(url, queryParams, getOpts) // initial request

    const newData = await Promise.all(response.data.map(map))
    const filtered = newData.filter((e): e is Exclude<typeof e, undefined> => e !== undefined)
    data.push(...filtered)

    if (!!max && data.length >= max) return data.slice(0, max)
    if (filtered.length < response.data.length) break
  } while ((next = response.pagination.links.find((link) => link.rel === "next")?.uri))

  return data
}

export async function getAllRunsSince<Embed extends string = "", S = Run<Embed>>(
  timestamp: Date,
  queryParams?: RunsParams<Embed>,
  options?: PaginatedGetOptions<Run<Embed>, S>,
) {
  return paginatedGetUntilMapNone<RunsResponse<Embed>, S | Run<Embed> | undefined>(`/runs`, queryParams, {
    ...options,
    map: (run) => {
      if (!run.submitted || new Date(run.submitted) < timestamp) return undefined
      return run
    },
  })
}

export function statusStrToStatus(status: "new" | "verified" | "rejected"): SrcRunStatus {
  switch (status) {
    case "new":
      return SrcRunStatus.New
    case "verified":
      return SrcRunStatus.Verified
    case "rejected":
      return SrcRunStatus.Rejected
    default:
      return SrcRunStatus.Unknown
  }
}

export function formatDuration(duration: Duration) {
  let result = ""
  if (duration.years) result += `${duration.years}y`
  if (duration.months) result += `${duration.months}m`
  if (duration.days) result += `${duration.days}d`
  if (duration.hours) result += `${duration.hours}h`
  if (duration.minutes) result += `${duration.minutes}m`
  if (duration.seconds) result += `${duration.seconds}s`
  return result
}

const suffixes = ["th", "st", "nd", "rd"]
export function formatPlace(place: number) {
  const mod100 = place % 100
  const mod10 = place % 10
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (suffixes[mod10] ?? "th")
  return `${place}${suffix}`
}

export function assertNever(value: never): never {
  console.error("Unexpected value: ", value)
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}

export async function getMessageFromLink(client: Client<true>, link: string): Promise<Message | undefined> {
  const [, guildId, channelId, messageId] = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/.exec(link) || []
  if (!guildId || !channelId || !messageId) return undefined
  const guild = await client.guilds.fetch(guildId)
  const channel = await guild.channels.fetch(channelId)
  if (!channel || !channel.isTextBased()) return undefined
  return channel.messages.fetch(messageId)
}
