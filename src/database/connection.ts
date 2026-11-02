import mongoose from 'mongoose';
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
  if (env.nodeEnv === 'production') await Promise.all([
    StateModel.createIndexes(), DistrictModel.createIndexes(), BranchModel.createIndexes(),
    LeadModel.createIndexes(), LeadStatusHistoryModel.createIndexes(), VisitModel.createIndexes(),
    CustomerModel.createIndexes(), CustomerDocumentModel.createIndexes(), CustomerDocumentUploadModel.createIndexes(), CustomerActivityModel.createIndexes(),
    QuotationModel.createIndexes(), QuotationSequenceModel.createIndexes(), BrochureModel.createIndexes(), PublicShareLinkModel.createIndexes(), QuotationShareModel.createIndexes(),
    AMCContractModel.createIndexes(), AMCScheduleModel.createIndexes(), AMCServiceHistoryModel.createIndexes(), AMCSequenceModel.createIndexes(), AuditLogModel.createIndexes()
  ]);
  logger.info('Connected to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
