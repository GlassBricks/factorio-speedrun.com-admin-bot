import { config } from "dotenv";
import { scheduleJob } from "node-schedule";
import { createLogger } from "./logger.js";
class TwitchClient {
    clientId;
    secret;
    token;
    refreshTokenJob;
    ratelimitWaitJob;
    logger = createLogger("[TwitchClient]");
    constructor(clientId, secret) {
        this.clientId = clientId;
        this.secret = secret;
    }
    async doRefreshToken() {
        this.token = undefined;
        this.logger.info("Refreshing token");
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.secret}&grant_type=client_credentials`, {
            method: "POST",
        });
        const json = (await response.json());
        if (!json.access_token)
            throw new Error("No access token in response");
        this.token = json.access_token;
        this.refreshTokenJob = undefined;
    }
    async refreshToken() {
        this.refreshTokenJob ??= this.doRefreshToken();
        return this.refreshTokenJob;
    }
    async waitUntilRatelimitReset(timestamp) {
        this.ratelimitWaitJob ??= new Promise((resolve) => {
            this.logger.info(`Waiting until ratelimit reset at ${new Date(timestamp * 1000).toISOString()}`);
            scheduleJob(new Date(timestamp * 1000 + 1000), () => {
                this.ratelimitWaitJob = undefined;
                resolve();
            });
        });
        return this.ratelimitWaitJob;
    }
    async authorizedApiRequest(input, init, isRetry = false) {
        await this.ratelimitWaitJob;
        if (this.token == undefined) {
            await this.refreshToken();
        }
        this.logger.info("Requesting", input);
        this.logger.debug(init);
        const response = await fetch(input, {
            ...init,
            headers: {
                "Client-ID": this.clientId,
                Authorization: `Bearer ${this.token}`,
            },
        });
        if (response.status == 401) {
            if (isRetry) {
                throw new Error("Unauthorized even after refreshing token");
            }
            await this.refreshToken();
            return this.authorizedApiRequest(input, init, true);
        }
        else if (response.status == 429) {
            this.logger.info("Rate limited, waiting until ratelimit reset");
            // rate limited
            const reset = response.headers.get("Ratelimit-Reset");
            if (!reset)
                throw new Error("Ratelimit-Reset header not found");
            const timestamp = parseInt(reset);
            if (isNaN(timestamp))
                throw new Error("Ratelimit-Reset header is not a number");
            await this.waitUntilRatelimitReset(timestamp);
            return this.authorizedApiRequest(input, init);
        }
        this.logger.info("Completed request", input);
        this.logger.debug(init, response);
        return response;
    }
    async getVideo(videoId) {
        const response = await this.authorizedApiRequest(`https://api.twitch.tv/helix/videos?id=${videoId}`);
        const json = (await response.json());
        return json.data[0];
    }
}
config();
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const twitchClient = new TwitchClient(TWITCH_CLIENT_ID, TWITCH_SECRET);
export default twitchClient;
//# sourceMappingURL=twitch.js.map