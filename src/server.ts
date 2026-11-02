import app from './app.js';
import { env } from './config/env.config.js';
import { connectDatabase, disconnectDatabase } from './database/connection.js';
import { logger } from './services/logger.service.js';

async function start(): Promise<void> {
  await connectDatabase();
  const server = app.listen(env.port, () => logger.info({ port: env.port }, 'Sunvika API listening'));

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Shutting down');
    server.close((error) => {
      if (error) {
        logger.error({ err: error }, 'HTTP server shutdown failed');
        process.exitCode = 1;
      }
      void disconnectDatabase().finally(() => process.exit());
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Application startup failed');
  process.exitCode = 1;
});
