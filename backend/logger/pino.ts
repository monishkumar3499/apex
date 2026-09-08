import pino, { type LevelWithSilent } from 'pino';

const VALID_LEVELS = new Set<string>([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function resolveLogLevel(raw?: string): LevelWithSilent {
  if (!raw) return 'info';
  const clean = raw.replace(/^["']|["']$/g, '').trim().toLowerCase();
  return VALID_LEVELS.has(clean) ? (clean as LevelWithSilent) : 'info';
}

// Define a structured logger that matches the development/production environment
export const logger = pino({
  level: resolveLogLevel(process.env.LOG_LEVEL),
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'kairo-backend'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;

