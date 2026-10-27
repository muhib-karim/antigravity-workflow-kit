/**
 * Antigravity Workflow Kit - Structured Logger
 * @module logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    data?: Record<string, unknown>;
}

class Logger {
    private static instance: Logger;
    private module: string = 'Workflow Kit';
    private isDebug: boolean = false;

    private constructor() { }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    setModule(name: string): Logger {
        const logger = new Logger();
        logger.module = name;
        logger.isDebug = this.isDebug;
        return logger;
    }

    setDebug(enabled: boolean): void {
        this.isDebug = enabled;
    }

    private formatEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
        return {
            timestamp: new Date().toISOString().split('T')[1].split('.')[0],
            level,
            module: this.module,
            message,
            data,
        };
    }

    private output(entry: LogEntry): void {
        const prefix = `[${entry.module} ${entry.timestamp}]`;
        const msg = `${prefix} ${entry.message}`;

        switch (entry.level) {
            case 'error':
                console.error(msg, entry.data || '');
                break;
            case 'warn':
                console.warn(msg, entry.data || '');
                break;
            case 'debug':
                if (this.isDebug) {
                    console.log(`[DEBUG] ${msg}`, entry.data || '');
                }
                break;
            default:
                console.log(msg, entry.data ? JSON.stringify(entry.data) : '');
        }
    }

    debug(message: string, data?: Record<string, unknown>): void {
        this.output(this.formatEntry('debug', message, data));
    }

    info(message: string, data?: Record<string, unknown>): void {
        this.output(this.formatEntry('info', message, data));
    }

    warn(message: string, data?: Record<string, unknown>): void {
        this.output(this.formatEntry('warn', message, data));
    }

    error(message: string, data?: Record<string, unknown>): void {
        this.output(this.formatEntry('error', message, data));
    }
}

export const logger = Logger.getInstance();
export const createLogger = (module: string): Logger => logger.setModule(module);
