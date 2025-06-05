const dev = process.env.NODE_ENV === "development";
const configFile = dev ? "config.dev.js" : "config.js";
const config = (await import(process.cwd() + "/" + configFile)).default;
export default config;
//# sourceMappingURL=config-file.js.map