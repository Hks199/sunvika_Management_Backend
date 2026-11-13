import { CpReminderScheduleModel, CpReminderRunModel } from './cp-reminders.model.js';
/** Replace obsolete uniqueness constraints without removing any schedules or delivery history. */
export async function upgradeReminderScheduleIndexes() {
  await CpReminderRunModel.collection.createIndex({ schedule: 1, slot: 1 }, { unique: true, name: 'schedule_slot_unique' });
  for (const [collection, keys] of [[CpReminderScheduleModel.collection, ['rm']], [CpReminderRunModel.collection, ['rm','slot']]] as const) {
    let indexes;
    try { indexes = await collection.listIndexes().toArray(); }
    catch (error) { if ((error as { code?: number }).code === 26) continue; throw error; }
    for (const index of indexes) {
      if (index.unique && index.name && Object.keys(index.key).length === keys.length && keys.every(key => index.key[key] === 1)) await collection.dropIndex(index.name);
    }
  }
}
