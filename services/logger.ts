export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: string;
}

type LogListener = (entry: LogEntry) => void;

class LoggerService {
  private listeners: LogListener[] = [];
  private logs: LogEntry[] = [];

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(entry: LogEntry) {
    this.logs.push(entry);
    this.listeners.forEach(l => l(entry));
  }

  getLogs() {
    return [...this.logs];
  }

  log(level: LogLevel, message: string, details?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : undefined
    };
    
    // Maintain browser console behavior for debugging
    const consoleMethod = level === 'info' ? 'log' : level;
    console[consoleMethod](`[${level.toUpperCase()}] ${message}`, details || '');

    this.notify(entry);
  }

  info(message: string, details?: any) { this.log('info', message, details); }
  warn(message: string, details?: any) { this.log('warn', message, details); }
  error(message: string, details?: any) { this.log('error', message, details); }
  
  clear() { 
    this.logs = []; 
    // We notify with a special system event or just let React state handle the reset via UI interaction
  }
}

export const logger = new LoggerService();