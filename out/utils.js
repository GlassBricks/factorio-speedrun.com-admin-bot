import { GuildChannel, PermissionFlagsBits } from "discord.js";
import { get, rawHTTP, } from "src-ts";
import { SrcRunStatus } from "./db/index.js";
export async function botCanSendInChannel(channel) {
    return (channel.isTextBased() &&
        channel.isSendable() &&
        (channel instanceof GuildChannel
            ? channel
                .permissionsFor(await channel.guild.members.fetchMe())
                .has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel, true)
            : true));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function paginatedGetUntilMapNone(url, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
queryParams, options = {}) {
    const { max, map, ...getOpts } = options;
    const { ...httpOpts } = getOpts;
    const data = [];
    let next, response;
    if (max && max < 1)
        return [];
    if (!map)
        throw new Error("Map must be supplied");
    do {
        response = next ? await rawHTTP(next, "get", httpOpts) : await get(url, queryParams, getOpts); // initial request
        const newData = await Promise.all(response.data.map(map));
        const filtered = newData.filter((e) => e !== undefined);
        data.push(...filtered);
        if (!!max && data.length >= max)
            return data.slice(0, max);
        if (filtered.length < response.data.length)
            break;
    } while ((next = response.pagination.links.find((link) => link.rel === "next")?.uri));
    return data;
}
export async function getAllRunsSince(timestamp, queryParams, options) {
    return paginatedGetUntilMapNone(`/runs`, queryParams, {
        ...options,
        map: (run) => {
            if (!run.submitted || new Date(run.submitted) < timestamp)
                return undefined;
            return run;
        },
    });
}
export function statusStrToStatus(status) {
    switch (status) {
        case "new":
            return SrcRunStatus.New;
        case "verified":
            return SrcRunStatus.Verified;
        case "rejected":
            return SrcRunStatus.Rejected;
        default:
            return SrcRunStatus.Unknown;
    }
}
export function formatDuration(duration) {
    let result = "";
    if (duration.years)
        result += `${duration.years}y`;
    if (duration.months)
        result += `${duration.months}m`;
    if (duration.days)
        result += `${duration.days}d`;
    if (duration.hours)
        result += `${duration.hours}h`;
    if (duration.minutes)
        result += `${duration.minutes}m`;
    if (duration.seconds)
        result += `${duration.seconds}s`;
    return result;
}
const suffixes = ["th", "st", "nd", "rd"];
export function formatPlace(place) {
    const mod100 = place % 100;
    const mod10 = place % 10;
    const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (suffixes[mod10] ?? "th");
    return `${place}${suffix}`;
}
export function assertNever(value) {
    console.error("Unexpected value: ", value);
    throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
export async function getMessageFromLink(client, link) {
    const [, guildId, channelId, messageId] = /https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/.exec(link) || [];
    if (!guildId || !channelId || !messageId)
        return undefined;
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || !channel.isTextBased())
        return undefined;
    return channel.messages.fetch(messageId);
}
//# sourceMappingURL=utils.js.map