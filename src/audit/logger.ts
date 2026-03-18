const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

// Cache the log level at module load
let cachedLevel: LogLevel | null = null;

function resolveLevel(): LogLevel {
  if (cachedLevel) return cachedLevel;
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  cachedLevel = (envLevel && envLevel in LOG_LEVELS) ? envLevel as LogLevel : "info";
  return cachedLevel;
}

/** Allow runtime level changes (e.g., from config reload) */
export function setLogLevel(level: LogLevel): void {
  cachedLevel = level;
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[resolveLevel()]) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...(data ? { data } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", module, msg, data),
    info: (msg: string, data?: Record<string, unknown>) => log("info", module, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", module, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", module, msg, data),
  };
}

export const logger = createLogger("stabledesk");
