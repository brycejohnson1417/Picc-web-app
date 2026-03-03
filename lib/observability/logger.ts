export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function base(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context } : {}),
  };
  // Structured JSON logs are easier to aggregate in hosted log platforms.
  console.log(JSON.stringify(payload));
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => base('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => base('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => base('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => base('error', message, context),
};
