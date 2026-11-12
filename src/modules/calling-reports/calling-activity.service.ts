import { randomUUID } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { CallingActivityModel } from './calling-report.models.js';

type List = { _id: Types.ObjectId; title?: string; assignedTo?: Types.ObjectId | null | undefined };
export const callingActivity = {
  async record(list: List, candidate: Types.ObjectId, performedBy: Types.ObjectId, kind: 'OUTCOME' | 'CONVERTED' | 'DELETED', status: string, session: ClientSession, occurredAt = new Date()) {
    const eventKey = kind === 'CONVERTED' ? `conversion:${candidate}` : randomUUID();
    await CallingActivityModel.updateOne({ eventKey }, { $setOnInsert: { eventKey, rm: list.assignedTo ?? null, performedBy,
      list: list._id, sheetName: list.title ?? 'Calling list', candidate, kind, status, occurredAt, source: 'LIVE' } }, { upsert: true, session });
  }
};
