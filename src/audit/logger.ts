type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: unknown;
};

function emit(level: LogLevel, message: string, context?: unknown): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context !== undefined && { context }),
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: unknown) => emit('debug', message, context),
  info:  (message: string, context?: unknown) => emit('info',  message, context),
  warn:  (message: string, context?: unknown) => emit('warn',  message, context),
  error: (message: string, context?: unknown) => emit('error', message, context),
};
