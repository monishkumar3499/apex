import pino from 'pino';

// Define a structured logger that matches the development/production environment
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'apex-backend'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;
