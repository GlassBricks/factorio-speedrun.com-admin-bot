var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var KnownFactorioVersion_1;
import { Column, CreatedAt, Index, Model, PrimaryKey, Sequelize, Table } from "sequelize-typescript";
// for vote-initiate command
let VoteInitiateMessage = class VoteInitiateMessage extends Model {
};
__decorate([
    Column,
    Index,
    __metadata("design:type", String)
], VoteInitiateMessage.prototype, "commandId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], VoteInitiateMessage.prototype, "guildId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], VoteInitiateMessage.prototype, "postChannelId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], VoteInitiateMessage.prototype, "postMessageId", void 0);
VoteInitiateMessage = __decorate([
    Table({ paranoid: true })
], VoteInitiateMessage);
export { VoteInitiateMessage };
// for notifying new factorio versions
let KnownFactorioVersion = KnownFactorioVersion_1 = class KnownFactorioVersion extends Model {
    static async get() {
        return (await KnownFactorioVersion_1.findOne()) ?? new KnownFactorioVersion_1();
    }
};
__decorate([
    Column,
    __metadata("design:type", String)
], KnownFactorioVersion.prototype, "stable", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], KnownFactorioVersion.prototype, "experimental", void 0);
KnownFactorioVersion = KnownFactorioVersion_1 = __decorate([
    Table
], KnownFactorioVersion);
export { KnownFactorioVersion };
export var SrcRunStatus;
(function (SrcRunStatus) {
    SrcRunStatus[SrcRunStatus["New"] = 0] = "New";
    SrcRunStatus[SrcRunStatus["Verified"] = 1] = "Verified";
    SrcRunStatus[SrcRunStatus["Rejected"] = 2] = "Rejected";
    SrcRunStatus[SrcRunStatus["Unknown"] = 37] = "Unknown";
})(SrcRunStatus || (SrcRunStatus = {}));
let AnnounceMessage = class AnnounceMessage extends Model {
};
__decorate([
    PrimaryKey,
    Column,
    __metadata("design:type", String)
], AnnounceMessage.prototype, "srcMessageId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], AnnounceMessage.prototype, "dstMessageId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], AnnounceMessage.prototype, "dstChannelId", void 0);
AnnounceMessage = __decorate([
    Table
], AnnounceMessage);
export { AnnounceMessage };
let SrcRun = class SrcRun extends Model {
};
__decorate([
    PrimaryKey,
    Column,
    __metadata("design:type", String)
], SrcRun.prototype, "runId", void 0);
__decorate([
    Index,
    Column,
    __metadata("design:type", Number)
], SrcRun.prototype, "lastStatus", void 0);
__decorate([
    Index({ order: "DESC" }),
    Column,
    __metadata("design:type", Date)
], SrcRun.prototype, "submissionTime", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], SrcRun.prototype, "messageChannelId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], SrcRun.prototype, "messageId", void 0);
__decorate([
    Column,
    __metadata("design:type", Number)
], SrcRun.prototype, "messageVersion", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], SrcRun.prototype, "videoProof", void 0);
SrcRun = __decorate([
    Table
], SrcRun);
export { SrcRun };
let MessageReport = class MessageReport extends Model {
};
__decorate([
    PrimaryKey,
    Index,
    Column,
    __metadata("design:type", String)
], MessageReport.prototype, "messageId", void 0);
__decorate([
    PrimaryKey,
    Index,
    Column,
    __metadata("design:type", String)
], MessageReport.prototype, "reporterId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], MessageReport.prototype, "messageUrl", void 0);
__decorate([
    Index,
    Column,
    __metadata("design:type", String)
], MessageReport.prototype, "authorId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], MessageReport.prototype, "reason", void 0);
__decorate([
    CreatedAt,
    Index,
    __metadata("design:type", Object)
], MessageReport.prototype, "createdAt", void 0);
MessageReport = __decorate([
    Table
], MessageReport);
export { MessageReport };
let DiscussionBan = class DiscussionBan extends Model {
};
__decorate([
    PrimaryKey,
    Column,
    __metadata("design:type", String)
], DiscussionBan.prototype, "guildId", void 0);
__decorate([
    PrimaryKey,
    Column,
    __metadata("design:type", String)
], DiscussionBan.prototype, "userId", void 0);
__decorate([
    Column,
    __metadata("design:type", Date)
], DiscussionBan.prototype, "bannedAt", void 0);
__decorate([
    Column,
    __metadata("design:type", Date)
], DiscussionBan.prototype, "expiresAt", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], DiscussionBan.prototype, "reason", void 0);
DiscussionBan = __decorate([
    Table
], DiscussionBan);
export { DiscussionBan };
const dev = process.env.NODE_ENV === "development";
export const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: dev ? ":memory:" : "database.sqlite",
    // storage: "database.sqlite",
    models: [VoteInitiateMessage, KnownFactorioVersion, SrcRun, AnnounceMessage, MessageReport, DiscussionBan],
});
//# sourceMappingURL=index.js.map