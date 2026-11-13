import mongoose from 'mongoose';
import {upgradeReminderScheduleIndexes} from '../modules/cp-reminders/cp-reminders.migration.js';
import {CP_REMINDER_MODELS} from '../modules/cp-reminders/cp-reminders.model.js';
import { CallingBatchModel, CallingAllocationModel, CallingDistributionSettingsModel } from '../modules/calling-lists/calling-bulk.model.js';
import { CallingListModel, CallingCandidateModel } from '../modules/calling-lists/calling-list.model.js';
import { CallingActivityModel, CallingDailyReportModel } from '../modules/calling-reports/calling-report.models.js';
import { env } from '../config/env.config.js';
import { logger } from '../services/logger.service.js';
import { StateModel } from '../modules/geography/models/state.model.js';
import { DistrictModel } from '../modules/geography/models/district.model.js';
import { BranchModel } from '../modules/geography/models/branch.model.js';
import { LeadModel } from '../modules/leads/models/lead.model.js';
import { LeadStatusHistoryModel } from '../modules/leads/models/lead-status-history.model.js';
import { VisitModel } from '../modules/visits/models/visit.model.js';
import { CustomerModel } from '../modules/customers/models/customer.model.js';
import { CustomerDocumentModel } from '../modules/customers/models/customer-document.model.js';
import { CustomerDocumentUploadModel } from '../modules/customers/models/customer-document-upload.model.js';
import { CustomerActivityModel } from '../modules/customers/models/customer-activity.model.js';
import { QuotationModel } from '../modules/quotations/models/quotation.model.js';
import { QuotationSequenceModel } from '../modules/quotations/models/quotation-sequence.model.js';
import { BrochureModel } from '../modules/quotations/models/brochure.model.js';
import { PublicShareLinkModel } from '../modules/quotations/models/public-share-link.model.js';
import { QuotationShareModel } from '../modules/quotations/models/quotation-share.model.js';
import { AMCContractModel } from '../modules/amc/models/amc-contract.model.js';
import { AMCScheduleModel } from '../modules/amc/models/amc-schedule.model.js';
import { AMCServiceHistoryModel } from '../modules/amc/models/amc-service-history.model.js';
import { AMCSequenceModel } from '../modules/amc/models/amc-sequence.model.js';
import { AuditLogModel } from '../modules/audit/models/audit-log.model.js';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: env.mongoMaxPoolSize,
    autoIndex: env.nodeEnv !== 'production'
  });
  await Promise.all([CallingActivityModel.init(), CallingDailyReportModel.init(), CallingBatchModel.init(), CallingAllocationModel.init(), CallingDistributionSettingsModel.init(), CallingListModel.init(), CallingCandidateModel.init()]);
  if (env.nodeEnv === 'production') await Promise.all([
    CallingBatchModel.createIndexes(), CallingAllocationModel.createIndexes(), CallingDistributionSettingsModel.createIndexes(), CallingListModel.createIndexes(), CallingCandidateModel.createIndexes(),
    StateModel.createIndexes(), DistrictModel.createIndexes(), BranchModel.createIndexes(),
    LeadModel.createIndexes(), LeadStatusHistoryModel.createIndexes(), VisitModel.createIndexes(),
    CustomerModel.createIndexes(), CustomerDocumentModel.createIndexes(), CustomerDocumentUploadModel.createIndexes(), CustomerActivityModel.createIndexes(),
    QuotationModel.createIndexes(), QuotationSequenceModel.createIndexes(), BrochureModel.createIndexes(), PublicShareLinkModel.createIndexes(), QuotationShareModel.createIndexes(),
    AMCContractModel.createIndexes(), AMCScheduleModel.createIndexes(), AMCServiceHistoryModel.createIndexes(), AMCSequenceModel.createIndexes(), AuditLogModel.createIndexes(), CallingActivityModel.createIndexes(), CallingDailyReportModel.createIndexes()
  ]);
  await upgradeReminderScheduleIndexes();
  await Promise.all(CP_REMINDER_MODELS.map(model=>env.nodeEnv==='production'?model.createIndexes():model.init()));
  logger.info('Connected to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
