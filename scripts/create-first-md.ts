import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import Joi from 'joi';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../src/config/env.config.js';
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js';
import { EmployeeModel } from '../src/modules/employees/models/employee.model.js';
import { HierarchyLockModel } from '../src/modules/employees/models/hierarchy-lock.model.js';
import { ProfileImageUploadModel } from '../src/modules/employees/models/profile-image-upload.model.js';
import { BootstrapStateModel } from '../src/modules/roles/models/bootstrap-state.model.js';
import { RoleModel } from '../src/modules/roles/models/role.model.js';
import { PermissionModel } from '../src/modules/roles/models/permission.model.js';
import { seedSystemRoles } from '../src/modules/roles/services/role.service.js';
import { hashPassword } from '../src/utils/password.util.js';
import { logger } from '../src/services/logger.service.js';

const bootstrapSchema = Joi.object({
  INITIAL_MD_FIRST_NAME: Joi.string().trim().min(1).max(80).required(),
  INITIAL_MD_LAST_NAME: Joi.string().trim().min(1).max(80).required(),
  INITIAL_MD_EMAIL: Joi.string().email().lowercase().trim().required(),
  INITIAL_MD_MOBILE: Joi.string().pattern(/^\+?[1-9]\d{7,14}$/).required(),
  INITIAL_MD_PASSWORD: Joi.string().min(12).max(128).pattern(/[a-z]/).pattern(/[A-Z]/).pattern(/[0-9]/).required(),
  INITIAL_MD_EMPLOYEE_CODE: Joi.string().trim().uppercase().pattern(/^[A-Z0-9][A-Z0-9-]{2,31}$/).allow('').default('')
}).unknown(true);

async function acquireBootstrapLock(): Promise<void> {
  const key = 'initial-md';
  const current = await BootstrapStateModel.findOne({ key });
  if (current?.status === 'COMPLETED') throw new Error('Initial MD has already been created; bootstrap cannot run again.');
  const now = new Date();
  if (current) {
    if (now.getTime() - current.lockedAt.getTime() < 10 * 60 * 1000) throw new Error('MD bootstrap is already in progress.');
    const claimed = await BootstrapStateModel.updateOne(
      { _id: current._id, status: 'IN_PROGRESS', lockedAt: current.lockedAt },
      { $set: { lockedAt: now } }
    );
    if (!claimed.modifiedCount) throw new Error('MD bootstrap is already in progress.');
    return;
  }
  try {
    await BootstrapStateModel.create({ key, status: 'IN_PROGRESS', lockedAt: now });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new Error('MD bootstrap is already in progress or has completed.');
    throw error;
  }
}

async function main(): Promise<void> {
  const { error, value } = bootstrapSchema.validate(process.env, { abortEarly: false, convert: true });
  if (error) throw new Error(`Missing or invalid initial MD configuration: ${error.details.map(({ message }) => message).join('; ')}`);

  await connectDatabase();
  await Promise.all([
    BootstrapStateModel.createIndexes(),
    RoleModel.createIndexes(),
    EmployeeModel.createIndexes(),
    HierarchyLockModel.createIndexes(),
    ProfileImageUploadModel.createIndexes(),
    PermissionModel.createIndexes()
  ]);
  await acquireBootstrapLock();
  await seedSystemRoles();
  const mdRole = await RoleModel.findOne({ code: 'MD', isActive: true });
  if (!mdRole) throw new Error('Unable to seed the MD system role.');
  if (await EmployeeModel.exists({ role: mdRole._id })) throw new Error('An MD account already exists; refusing to create another.');

  const employeeId = new Types.ObjectId();
  const employee = await EmployeeModel.create({
    _id: employeeId,
    employeeCode: value.INITIAL_MD_EMPLOYEE_CODE || `SVK-MD-${randomBytes(4).toString('hex').toUpperCase()}`,
    firstName: value.INITIAL_MD_FIRST_NAME,
    lastName: value.INITIAL_MD_LAST_NAME,
    email: value.INITIAL_MD_EMAIL,
    mobileNumber: value.INITIAL_MD_MOBILE,
    address: { addressLine: '' },
    role: mdRole._id,
    reportingTo: undefined,
    hierarchyPath: [],
    isActive: true,
    isVerified: true,
    passwordHash: await hashPassword(value.INITIAL_MD_PASSWORD),
    createdBy: employeeId
  });
  await RoleModel.updateMany({ isSystemRole: true }, { $set: { createdBy: employee._id } });
  await BootstrapStateModel.updateOne({ key: 'initial-md' }, { $set: { status: 'COMPLETED', completedAt: new Date() } });
  logger.info({ employeeId: employee._id.toString(), employeeCode: employee.employeeCode }, 'Initial MD account and system roles created');
}

main()
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'Initial MD bootstrap failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => undefined);
  });
