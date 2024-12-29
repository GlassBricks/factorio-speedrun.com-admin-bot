import { createDefaultEsmPreset } from "ts-jest"

/** @type {import("ts-jest").JestConfigWithTsJest} **/
export default {
  ...createDefaultEsmPreset(),
  resolver: "jest-ts-webcompat-resolver",
}
