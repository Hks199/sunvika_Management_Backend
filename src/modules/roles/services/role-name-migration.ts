import { RoleModel } from '../models/role.model.js';

const ROLE_RENAMES = [
  { oldCode: 'BDO', code: 'MIS', name: 'Management Information System' },
  { oldCode: 'DC', code: 'CP_HEAD', name: 'Channel Partner Head' }
] as const;

/** Rename in place so employee assignments and role hierarchy references keep their IDs. */
export async function migrateSystemRoleNames(): Promise<void> {
  const roles = await RoleModel.find({
    code: { $in: ROLE_RENAMES.flatMap(({ oldCode, code }) => [oldCode, code]) }
  }).select('_id code name isSystemRole').lean();

  // Validate both renames before writing to avoid a partial migration on code conflicts.
  for (const { oldCode, code } of ROLE_RENAMES) {
    const legacy = roles.find((role) => role.code === oldCode);
    const current = roles.find((role) => role.code === code);
    if ((legacy && !legacy.isSystemRole) || (current && !current.isSystemRole) || (legacy && current)) {
      throw new Error(`Cannot migrate ${oldCode} to ${code}: conflicting role codes require manual resolution`);
    }
  }

  for (const { oldCode, code, name } of ROLE_RENAMES) {
    const role = roles.find((entry) => entry.code === oldCode || entry.code === code);
    if (role && (role.code !== code || role.name !== name)) {
      await RoleModel.updateOne({ _id: role._id, code: role.code }, {
        $set: { code, name }, $inc: { permissionVersion: 1 }
      });
    }
  }
}
