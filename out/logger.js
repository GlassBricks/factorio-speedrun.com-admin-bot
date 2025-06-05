import { container } from "@sapphire/framework";
export function createLogger(prefix) {
    const methods = ["debug", "error", "info", "trace", "warn", "fatal"];
    const result = {};
    for (const method of methods) {
        result[method] = (...args) => {
            container.logger[method](prefix, ...args);
        };
    }
    return {
        ...result,
        has: (a) => container.logger.has(a),
        write(level, ...values) {
            container.logger.write(level, prefix, ...values);
        },
    };
}
//# sourceMappingURL=logger.js.map