var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Column, CreatedAt, Model, PrimaryKey, Table, UpdatedAt } from "sequelize-typescript";
import { DataTypes } from "sequelize";
export var ReplayVerificationStatus;
(function (ReplayVerificationStatus) {
    ReplayVerificationStatus["Pending"] = "pending";
    ReplayVerificationStatus["Running"] = "running";
    ReplayVerificationStatus["Passed"] = "passed";
    ReplayVerificationStatus["NeedsReview"] = "needs_review";
    ReplayVerificationStatus["Failed"] = "failed";
    ReplayVerificationStatus["Error"] = "error";
})(ReplayVerificationStatus || (ReplayVerificationStatus = {}));
let ReplayVerification = class ReplayVerification extends Model {
};
__decorate([
    PrimaryKey,
    Column,
    __metadata("design:type", String)
], ReplayVerification.prototype, "runId", void 0);
__decorate([
    Column,
    __metadata("design:type", String)
], ReplayVerification.prototype, "status", void 0);
__decorate([
    Column(DataTypes.TEXT),
    __metadata("design:type", Object)
], ReplayVerification.prototype, "message", void 0);
__decorate([
    CreatedAt,
    __metadata("design:type", Object)
], ReplayVerification.prototype, "createdAt", void 0);
__decorate([
    UpdatedAt,
    __metadata("design:type", Object)
], ReplayVerification.prototype, "updatedAt", void 0);
ReplayVerification = __decorate([
    Table
], ReplayVerification);
export { ReplayVerification };
//# sourceMappingURL=replay-verification.js.map