type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isProd = process.env.NODE_ENV === 'production';

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    if (this.isProd) {
      return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        message,
        ...context,
      });
    }

    const contextStr = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return `${prefix} ${message}${contextStr}`;
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatMessage('error', message, context));
  }

  debug(message: string, context?: LogContext): void {
    if (!this.isProd || process.env.DEBUG) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }
}

export const logger = new Logger();
