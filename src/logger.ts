import { container, ILogger, LogLevel } from "@sapphire/framework"

export function createLogger(prefix: string, wrapperLogger: ILogger = container.logger): ILogger {
  const methods = ["debug", "error", "info", "trace", "warn", "fatal"] as const
  const result = {} as Record<(typeof methods)[number], (...values: unknown[]) => void>
  for (const method of methods) {
    result[method] = wrapperLogger[method].bind(wrapperLogger, prefix)
  }
  return {
    ...result,
    has: wrapperLogger.has.bind(wrapperLogger),
    write(level: LogLevel, ...values) {
      wrapperLogger.write(level, prefix, ...values)
    },
  }
}
