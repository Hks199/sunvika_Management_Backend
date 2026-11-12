import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/database/connection.js';
import { EmployeeModel } from '../src/modules/employees/models/employee.model.js';
import { RoleModel } from '../src/modules/roles/models/role.model.js';
import { RefreshTokenModel } from '../src/modules/auth/models/refresh-token.model.js';
import { withHierarchyLock } from '../src/modules/employees/services/employee.service.js';
import { planDirectMdHierarchy } from '../src/modules/employees/services/direct-md-hierarchy.js';

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => !['--apply', '--mh-to-mis', '--deactivate-mh', '--delete-mh'].includes(arg)) || (['--mh-to-mis', '--deactivate-mh', '--delete-mh'].filter(arg => args.has(arg)).length > 1)) throw new Error('Use [--apply] with at most one of --mh-to-mis, --deactivate-mh or --delete-mh');
  await connectDatabase();
  const run = async () => {
    const roles = await RoleModel.find().select('_id code category parentRole allowedChildRoles isSystemRole').lean();
    const byId = new Map(roles.map(role => [String(role._id), role]));
    const byCode = new Map(roles.map(role => [role.code, role]));
    if (byCode.has('BDO') || byCode.has('DC')) throw new Error('Complete the existing BDO/MIS and DC/CP_HEAD role-name migration first');
    const md = byCode.get('MD'), mis = byCode.get('MIS'), head = byCode.get('CP_HEAD'), retired = byCode.get('MH');
    if (retired && !retired.isSystemRole) throw new Error('MH is not a system role; manual resolution is required');
    if (!md || !mis || !head) throw new Error('MD, MIS and CP_HEAD roles must already exist');
    if (retired && roles.some(role => role.code !== 'CP_HEAD' && role.parentRole?.equals(retired._id))) throw new Error('A custom role still has MH as its parent; reconfigure it before migration');
    const employees = await EmployeeModel.find().select('_id role reportingTo hierarchyPath isActive').lean();
    const oldMhIds = employees.filter(employee => retired && employee.role.equals(retired._id)).map(employee => employee._id);
    if (args.has('--delete-mh') && oldMhIds.length) {
      const fields = ['createdBy', 'creatorId', 'updatedBy', 'employee', 'employeeId', 'assignedTo', 'assignedEmployee', 'ownerId', 'owner', 'performedBy', 'uploadedBy', 'verifiedBy'];
      // Audit/creator/upload history retains original actor IDs after account removal.
      // No profile-upload records or storage assets are modified or deleted.
      const ignored = new Set(['employees', 'roles', 'refreshtokens', 'audit_logs', 'hierarchylocks', 'profileimageuploads']);
      for (const { name } of await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray()) {
        if (ignored.has(name)) continue;
        if (await mongoose.connection.db!.collection(name).countDocuments({ $or: fields.map(field => ({ [field]: { $in: oldMhIds } })) })) throw new Error('MH employees have linked records in ' + name + '; resolve their ownership before deleting accounts');
      }
    }
    const changes = planDirectMdHierarchy(employees.map(employee => {
      const role = byId.get(String(employee.role));
      if (!role) throw new Error(`Unknown employee role for ${employee._id}`);
      return { id: String(employee._id), roleCode: role.code, reportingTo: employee.reportingTo ? String(employee.reportingTo) : undefined, hierarchyPath: employee.hierarchyPath.map(String), isActive: employee.isActive };
    }), args.has('--mh-to-mis') ? 'mis' : args.has('--deactivate-mh') ? 'deactivate' : args.has('--delete-mh') ? 'delete' : undefined);
    console.log(JSON.stringify({ mode: args.has('--apply') ? 'apply' : 'dry-run', employeeChanges: changes.length, mhAccountsToDelete: args.has('--delete-mh') ? oldMhIds.length : 0, mhAccounts: employees.filter(employee => retired && employee.role.equals(retired._id)).length, changes }, null, 2));
    if (!args.has('--apply')) return;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (changes.length) await EmployeeModel.bulkWrite(changes.map(change => ({ updateOne: {
          filter: { _id: new Types.ObjectId(change.id) },
          update: { $set: { role: byCode.get(change.roleCode)!._id, hierarchyPath: change.hierarchyPath.map(id => new Types.ObjectId(id)), isActive: change.isActive, ...(change.reportingTo ? { reportingTo: new Types.ObjectId(change.reportingTo) } : {}) }, ...(!change.reportingTo ? { $unset: { reportingTo: 1 } } : {}) }
        } })), { session, ordered: true });
        if (retired) {
          await RoleModel.updateMany({}, { $pull: { allowedChildRoles: retired._id } }, { session });
          await RoleModel.updateOne({ _id: retired._id }, { $set: { isActive: false, parentRole: null, allowedChildRoles: [], permissions: [] }, $inc: { permissionVersion: 1 } }, { session });
          await RefreshTokenModel.updateMany({ employee: { $in: oldMhIds }, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
        }
        await RoleModel.updateOne({ _id: md._id }, { $addToSet: { allowedChildRoles: head._id }, $inc: { permissionVersion: 1 } }, { session });
        await RoleModel.updateOne({ _id: mis._id }, { $pull: { allowedChildRoles: head._id }, $set: { parentRole: md._id, level: 1 }, $inc: { permissionVersion: 1 } }, { session });
        if (args.has('--delete-mh') && retired) {
          await RefreshTokenModel.deleteMany({ employee: { $in: oldMhIds } }, { session });
          const deleted = await EmployeeModel.deleteMany({ _id: { $in: oldMhIds }, role: retired._id }, { session });
          if (deleted.deletedCount !== oldMhIds.length) throw new Error('MH account set changed; transaction rolled back');
          await RoleModel.deleteOne({ _id: retired._id, code: 'MH', isSystemRole: true }, { session });
        }
        for (const [code, level] of [['CP_HEAD', 1], ['RM', 2], ['CP', 3]] as const) {
          const role = byCode.get(code);
          if (role) await RoleModel.updateOne({ _id: role._id }, { $set: { level, ...(code === 'CP_HEAD' ? { parentRole: md._id } : {}) }, $inc: { permissionVersion: 1 } }, { session });
        }
      });
    } finally { await session.endSession(); }
    console.log('Hierarchy migration committed. Restart the API to clear cached role permissions.');
  };
  if (args.has('--apply')) await withHierarchyLock(run);
  else await run();
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => disconnectDatabase());
