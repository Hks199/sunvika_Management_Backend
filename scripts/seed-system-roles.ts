import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js';
import { seedSystemRoles } from '../src/modules/roles/services/role.service.js';
import { logger } from '../src/services/logger.service.js';

async function main() {
  await connectDatabase();
  await seedSystemRoles();
  logger.info('System roles and permissions updated');
}

main()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'System role seeding failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => undefined);
  });
