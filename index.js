import { execSync } from "child_process"

execSync("npm run build", { stdio: "inherit" })
execSync("node ./out/main.js 2>&1 | tee ./out/log.txt", { stdio: "inherit" })
