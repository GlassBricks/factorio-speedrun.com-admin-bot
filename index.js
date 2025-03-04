import { execSync } from "child_process"

execSync("npm run build", { stdio: "inherit" })
await import("./out/main.js")
