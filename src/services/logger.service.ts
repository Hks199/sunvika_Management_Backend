import pino from 'pino';
import { env } from '../config/env.config.js';

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash', 'token', 'refreshToken', 'smtpPassword', 'auth.pass', 'options.auth.pass'],
    censor: '[REDACTED]'
  },
  base: { service: 'sunvika-management-api', environment: env.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime
});
