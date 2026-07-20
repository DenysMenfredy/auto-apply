import { pino } from "pino";
import type { LogContext, Logger } from "../../shared/interfaces/logger.js";

export interface LoggerOptions {
  level?: string;
  /** Human-readable output for interactive CLI runs. */
  pretty?: boolean;
}

export function createPinoLogger(options: LoggerOptions = {}): Logger {
  const instance = pino({
    level: options.level ?? "info",
    ...(options.pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : {}),
  });

  return {
    debug: (message: string, context?: LogContext) => instance.debug(context ?? {}, message),
    info: (message: string, context?: LogContext) => instance.info(context ?? {}, message),
    warn: (message: string, context?: LogContext) => instance.warn(context ?? {}, message),
    error: (message: string, context?: LogContext) => instance.error(context ?? {}, message),
  };
}
