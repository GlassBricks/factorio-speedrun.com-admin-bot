import { container, ILogger, LogLevel } from "@sapphire/framework"

export function createLogger(prefix: string): ILogger {
  const methods = ["debug", "error", "info", "trace", "warn", "fatal"] as const
  const result = {} as Record<(typeof methods)[number], (...values: unknown[]) => void>
  for (const method of methods) {
    result[method] = (...args: unknown[]) => {
      container.logger[method](prefix, ...args)
    }
  }
  return {
    ...result,
    has: (a) => container.logger.has(a),
    write(level: LogLevel, ...values) {
      container.logger.write(level, prefix, ...values)
    },
  }
}
