import mongoose, { Types, type ClientSession } from 'mongoose';
import { EmployeeModel } from '../employees/models/employee.model.js';
import { RoleModel } from '../roles/models/role.model.js';
import { AppError } from '../../utils/app-error.util.js';
import { createPaginationMeta, type PaginationInput } from '../../utils/pagination.util.js';
import { QueryThreadModel, QueryMessageModel, QueryNotificationModel } from './query.models.js';
import { QUERY_ROLES, canRaiseQuery, canAccessQuery, notificationRecipients } from './query.policy.js';
import {CpReminderNotificationModel} from '../cp-reminders/cp-reminders.model.js';
const personFields = 'firstName middleName lastName employeeCode';
function id(value: string) { if (!Types.ObjectId.isValid(value)) throw new AppError('Invalid query or notification ID', 400); return new Types.ObjectId(value); }
async function actor(actorId: Types.ObjectId) {
  const employee = await EmployeeModel.findOne({ _id: actorId, isActive: true }).select('role hierarchyPath reportingTo').lean();
  const role = employee ? await RoleModel.findOne({ _id: employee.role, isActive: true }).select('code').lean() : null;
  if (!employee || !role || !QUERY_ROLES.includes(role.code)) throw new AppError('Queries are not available for your role', 403);
  return { employee, code: role.code };
}
async function access(actorId: Types.ObjectId, threadId: string) {
  const user = await actor(actorId);
  const thread = await QueryThreadModel.findById(id(threadId)).lean();
  if (!thread || !canAccessQuery(String(actorId), user.code, String(thread.createdBy), String(thread.assignedTo))) throw new AppError('Query not found', 404);
  return thread;
}
async function recipients(actorId: Types.ObjectId) {
  const user = await actor(actorId);
  if (!canRaiseQuery(user.code)) throw new AppError('Only RM, CP and MD can raise queries', 403);
  const includeRm = user.code === 'CP' || user.code === 'MD';
  const roles = await RoleModel.find({ code: { $in: ['CP_HEAD', 'MIS', ...(includeRm ? ['RM'] : [])] }, isActive: true }).select('_id code').lean();
  const heads = roles.filter(role => role.code === 'CP_HEAD').map(role => role._id);
  const mis = roles.filter(role => role.code === 'MIS').map(role => role._id);
  const rms = roles.filter(role => role.code === 'RM').map(role => role._id);
  const people = await EmployeeModel.find({ isActive: true, $or: [
    { role: { $in: mis } },
    { role: { $in: heads }, ...(user.code === 'MD' ? {} : { _id: { $in: user.employee.hierarchyPath } }) },
    ...(includeRm ? [{ role: { $in: rms }, ...(user.code === 'MD' ? {} : { _id: user.employee.reportingTo ?? null }) }] : [])
  ] }).select(personFields + ' role').sort({ firstName: 1, lastName: 1 }).lean();
  return people.map(person => ({ _id: person._id, firstName: person.firstName, middleName: person.middleName, lastName: person.lastName, employeeCode: person.employeeCode, roleCode: roles.find(role => role._id.equals(person.role))!.code }));
}
async function notify(session: ClientSession, actorId: Types.ObjectId, thread: { _id: Types.ObjectId; createdBy: Types.ObjectId; assignedTo: Types.ObjectId; title: string }, messageId: Types.ObjectId, isNew: boolean) {
  const roles = await RoleModel.find({ code: 'MD', isActive: true }).select('_id').session(session).lean();
  const directors = await EmployeeModel.find({ role: { $in: roles.map(role => role._id) }, isActive: true }).select('_id').session(session).lean();
  const people = notificationRecipients(String(actorId), [String(thread.createdBy), String(thread.assignedTo)], directors.map(person => String(person._id)));
  if (people.length) await QueryNotificationModel.insertMany(people.map(recipient => ({ recipient: id(recipient), thread: thread._id, message: messageId, title: `${isNew ? 'New query' : 'Query reply'}: ${thread.title}` })), { session });
}
export const queryService = {
  recipients,
  async create(actorId: Types.ObjectId, input: { title: string; body: string; recipientRole: string; recipientId: string }) {
    const eligible = await recipients(actorId);
    if (!eligible.some(person => String(person._id) === input.recipientId && person.roleCode === input.recipientRole)) throw new AppError('Choose an available recipient for the selected role', 400);
    return mongoose.connection.transaction(async session => {
      const [thread] = await QueryThreadModel.create([{ title: input.title, createdBy: actorId, assignedTo: id(input.recipientId), recipientRole: input.recipientRole, lastMessageAt: new Date() }], { session });
      if (!thread) throw new AppError('Unable to create query', 500);
      const [message] = await QueryMessageModel.create([{ thread: thread._id, sender: actorId, body: input.body }], { session });
      if (!message) throw new AppError('Unable to save query message', 500);
      await notify(session, actorId, thread, message._id, true);
      return { _id: thread._id };
    });
  },
  async list(actorId: Types.ObjectId, pagination: PaginationInput) {
    const user = await actor(actorId);
    const filter = user.code === 'MD' ? {} : { $or: [{ createdBy: actorId }, { assignedTo: actorId }] };
    const [items, total] = await Promise.all([
      QueryThreadModel.find(filter).populate('createdBy', personFields).populate('assignedTo', personFields).sort({ lastMessageAt: -1, _id: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      QueryThreadModel.countDocuments(filter)
    ]);
    return { items, meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },
  async detail(actorId: Types.ObjectId, threadId: string, pagination: PaginationInput) {
    const thread = await access(actorId, threadId);
    const [populated, messages, total] = await Promise.all([
      QueryThreadModel.findById(thread._id).populate('createdBy', personFields).populate('assignedTo', personFields).lean(),
      QueryMessageModel.find({ thread: thread._id }).populate('sender', personFields).sort({ createdAt: -1, _id: -1 }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit).lean(),
      QueryMessageModel.countDocuments({ thread: thread._id })
    ]);
    return { thread: populated, messages: messages.reverse(), meta: createPaginationMeta(pagination.page, pagination.limit, total) };
  },
  async reply(actorId: Types.ObjectId, threadId: string, body: string) {
    const thread = await access(actorId, threadId);
    return mongoose.connection.transaction(async session => {
      const [message] = await QueryMessageModel.create([{ thread: thread._id, sender: actorId, body }], { session });
      if (!message) throw new AppError('Unable to save reply', 500);
      await QueryThreadModel.updateOne({ _id: thread._id }, { $set: { lastMessageAt: new Date() } }, { session });
      await notify(session, actorId, thread, message._id, false);
      return { _id: message._id };
    });
  },
  async seen(actorId: Types.ObjectId, threadId: string, messageIds: string[]) {
    await access(actorId, threadId);
    await QueryNotificationModel.updateMany({ recipient: actorId, thread: id(threadId), message: { $in: messageIds.map(id) }, readAt: null }, { $set: { readAt: new Date() } });
    return { success: true };
  },
  async notifications(actorId: Types.ObjectId, pagination: PaginationInput) {
    await actor(actorId);
    const filter={recipient:actorId};
    const [items,queries,reminders,unreadQueries,unreadReminders]=await Promise.all([
      QueryNotificationModel.aggregate([{$match:filter},{$unionWith:{coll:CpReminderNotificationModel.collection.name,pipeline:[{$match:filter}]}},{$sort:{createdAt:-1,_id:-1}},{$skip:(pagination.page-1)*pagination.limit},{$limit:pagination.limit}]),
      QueryNotificationModel.countDocuments(filter),CpReminderNotificationModel.countDocuments(filter),
      QueryNotificationModel.countDocuments({...filter,readAt:null}),CpReminderNotificationModel.countDocuments({...filter,readAt:null})
    ]);
    return {items,unreadCount:unreadQueries+unreadReminders,meta:createPaginationMeta(pagination.page,pagination.limit,queries+reminders)};
  },
  async readNotification(actorId: Types.ObjectId, notificationId: string) {
    await actor(actorId);
    const result = await QueryNotificationModel.findOneAndUpdate({ _id: id(notificationId), recipient: actorId }, { $set: { readAt: new Date() } }, { new: true }).lean() ?? await CpReminderNotificationModel.findOneAndUpdate({ _id: id(notificationId), recipient: actorId }, { $set: { readAt: new Date() } }, { new: true }).lean();
    if (!result) throw new AppError('Notification not found', 404);
    return 'thread' in result ? { thread: result.thread } : result;
  }
};
