/**
 * Console-backed stand-in for pino.
 *
 * pino resolves its internals with runtime require() against a __dirname that
 * Vite's externalisation rewrites, so it cannot load under vitest. Tests alias
 * the bare `pino` specifier to this module (see vitest.config.ts); it exposes
 * the same factory shape, so backend/logger/pino.ts needs no test-only branch.
 */

type Fields = Record<string, unknown>;

const LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
type Level = (typeof LEVELS)[number];

function emit(level: Level, a?: Fields | string, b?: string) {
  const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (configured === 'silent') return;
  const floor = LEVELS.indexOf(configured as Level);
  if (floor >= 0 && LEVELS.indexOf(level) < floor) return;

  const [fields, message] = typeof a === 'string' ? [undefined, a] : [a, b];
  const line = `[${level}] ${message ?? ''}`;
  if (fields && Object.keys(fields).length) console.log(line, fields);
  else console.log(line);
}

export const logger = {
  debug: (a?: Fields | string, b?: string) => emit('debug', a, b),
  info: (a?: Fields | string, b?: string) => emit('info', a, b),
  warn: (a?: Fields | string, b?: string) => emit('warn', a, b),
  error: (a?: Fields | string, b?: string) => emit('error', a, b),
  fatal: (a?: Fields | string, b?: string) => emit('fatal', a, b),
};

/** pino-compatible factory: `pino({ level, base, timestamp })`. */
const factory = () => logger;
factory.stdTimeFunctions = { isoTime: () => `,"time":"${new Date().toISOString()}"` };

export default factory;
