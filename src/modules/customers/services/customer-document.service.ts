import { randomUUID } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Types, type ClientSession } from 'mongoose';
import { env } from '../../../config/env.config.js';
import { AppError } from '../../../utils/app-error.util.js';
import { logger } from '../../../services/logger.service.js';
import { CustomerActivityModel } from '../models/customer-activity.model.js';
import { CustomerDocumentModel } from '../models/customer-document.model.js';
import { CustomerDocumentUploadModel } from '../models/customer-document-upload.model.js';
import { LeadModel } from '../../leads/models/lead.model.js';
import { hierarchyService } from '../../employees/services/hierarchy.service.js';
import { assertCustomerAccess } from './customer-access.service.js';

export const CUSTOMER_DOCUMENT_TYPES = ['PAN', 'AADHAAR', 'ELECTRICITY_BILL', 'BANK_PASSBOOK'] as const;
export type CustomerDocumentType = typeof CUSTOMER_DOCUMENT_TYPES[number];
const MIME_EXTENSIONS = new Map([['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const UPLOAD_TTL_SECONDS = 600;
let client: S3Client | undefined;

function storage(): S3Client {
  if (!env.awsRegion || !env.awsCustomerDocumentBucketName) throw new AppError('Customer document storage is not configured', 503);
  if (!client) {
    const credentialsConfigured = Boolean(env.awsAccessKeyId && env.awsSecretAccessKey);
    client = new S3Client({ region: env.awsRegion, followRegionRedirects: true, ...(credentialsConfigured ? { credentials: { accessKeyId: env.awsAccessKeyId, secretAccessKey: env.awsSecretAccessKey } } : {}) });
  }
  return client;
}

function verifyMagic(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'application/pdf') return Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-';
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.subarray(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  return mime === 'image/webp' && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
}

function safeFileName(value: string): string {
  const clean = value.replace(/[\\/\u0000-\u001f";]/g, '_').trim();
  if (!clean || clean === '.' || clean === '..') throw new AppError('Invalid document file name', 400);
  return clean.slice(0, 180);
}
function parseId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new AppError(`Invalid ${label}`, 400);
  return new Types.ObjectId(value);
}

export const customerDocumentService = {
  async createLeadConversionUploadUrls(actorId: Types.ObjectId, leadId: string, documents: Array<{ documentType: CustomerDocumentType; fileName: string; mimeType: string; fileSize: number }>) {
    const lead = await LeadModel.findById(parseId(leadId, 'lead ID')).select('creatorId');
    if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'lead')) throw new AppError('Lead not found', 404);
    if (documents.length !== CUSTOMER_DOCUMENT_TYPES.length || new Set(documents.map(({ documentType }) => documentType)).size !== CUSTOMER_DOCUMENT_TYPES.length || CUSTOMER_DOCUMENT_TYPES.some((type) => !documents.some((document) => document.documentType === type))) {
      throw new AppError('Upload exactly one of each required customer document: PAN, AADHAAR, ELECTRICITY_BILL, and BANK_PASSBOOK', 400);
    }
    for (const input of documents) {
      if (!MIME_EXTENSIONS.has(input.mimeType)) throw new AppError('Only PDF, JPEG, PNG, and WebP documents are accepted', 400);
      if (!Number.isInteger(input.fileSize) || input.fileSize < 1 || input.fileSize > env.customerDocumentMaxSizeBytes) throw new AppError('Document size exceeds the configured limit', 400);
    }
    storage();
    return Promise.all(documents.map(async (input) => {
      const ext = MIME_EXTENSIONS.get(input.mimeType);
      if (!ext) throw new AppError('Only PDF, JPEG, PNG, and WebP documents are accepted', 400);
      const key = `customer-document-staging/${lead._id.toString()}/${randomUUID()}.${ext}`;
      const expiresAt = new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000);
      const upload = await CustomerDocumentUploadModel.create({ lead: lead._id, owner: actorId, documentType: input.documentType, fileName: safeFileName(input.fileName), key, contentType: input.mimeType, size: input.fileSize, expiresAt, status: 'PENDING' });
      try {
        return { uploadId: upload._id.toString(), documentType: input.documentType, expiresAt };
      } catch (error) {
        await CustomerDocumentUploadModel.deleteOne({ _id: upload._id });
        throw error;
      }
    }));
  },
  async uploadLeadConversionDocument(actorId: Types.ObjectId, leadId: string, uploadId: string, contentType: string, bytes: Uint8Array) {
    const parsedLeadId = parseId(leadId, 'lead ID');
    const parsedUploadId = parseId(uploadId, 'document upload ID');
    const lead = await LeadModel.findById(parsedLeadId).select('creatorId');
    if (!lead || !await hierarchyService.canAccessResource(actorId, lead.creatorId, 'lead')) throw new AppError('Lead not found', 404);
    if (!MIME_EXTENSIONS.has(contentType)) throw new AppError('Only PDF, JPEG, PNG, and WebP documents are accepted', 400);
    if (bytes.byteLength < 1 || bytes.byteLength > env.customerDocumentMaxSizeBytes) throw new AppError('Document size exceeds the configured limit', 400);
    const upload = await CustomerDocumentUploadModel.findOne({
      _id: parsedUploadId,
      lead: parsedLeadId,
      owner: actorId,
      contentType,
      size: bytes.byteLength,
      status: 'PENDING',
      uploadedAt: null,
      expiresAt: { $gt: new Date() }
    });
    if (!upload) throw new AppError('Document upload is invalid, expired, or does not match the selected file', 400);
    if (!verifyMagic(contentType, bytes)) throw new AppError('Uploaded file content does not match its declared type', 400);
    const claimed = await CustomerDocumentUploadModel.findOneAndUpdate(
      { _id: upload._id, status: 'PENDING', uploadedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { status: 'UPLOADING' } },
      { new: true }
    );
    if (!claimed) throw new AppError('This document upload is already in progress or has already been uploaded', 409);

    try {
      await storage().send(new PutObjectCommand({
        Bucket: env.awsCustomerDocumentBucketName,
        Key: claimed.key,
        Body: Buffer.from(bytes),
        ContentLength: bytes.byteLength,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: { lead: parsedLeadId.toString(), uploader: actorId.toString() }
      }));
      const completed = await CustomerDocumentUploadModel.updateOne(
        { _id: claimed._id, status: 'UPLOADING' },
        { $set: { status: 'PENDING', uploadedAt: new Date() } }
      );
      if (!completed.modifiedCount) throw new AppError('Uploaded document could not be recorded; request a new upload and retry', 409);
      return { uploadId: claimed._id.toString(), documentType: claimed.documentType };
    } catch (error) {
      await CustomerDocumentUploadModel.updateOne({ _id: claimed._id, status: 'UPLOADING' }, { $set: { status: 'REVOKED' } });
      if (error instanceof AppError) throw error;
      const failure = error instanceof Error ? error : new Error('Unknown S3 error');
      const errorCode = 'name' in failure && typeof failure.name === 'string' ? failure.name : 'UnknownStorageError';
      logger.error({
        err: failure,
        uploadId,
        errorCode,
        bucket: env.awsCustomerDocumentBucketName,
        key: claimed.key,
        region: env.awsRegion,
        requestId: '$metadata' in failure && failure.$metadata && typeof failure.$metadata === 'object' && 'requestId' in failure.$metadata
          ? failure.$metadata.requestId
          : undefined,
        httpStatusCode: '$metadata' in failure && failure.$metadata && typeof failure.$metadata === 'object' && 'httpStatusCode' in failure.$metadata
          ? failure.$metadata.httpStatusCode
          : undefined
      }, 'Failed to upload lead conversion document');
      if (errorCode === 'AccessDenied') throw new AppError('AWS denied the customer document upload. Grant the backend role s3:PutObject access to the configured customer document bucket.', 503);
      if (errorCode === 'NoSuchBucket') throw new AppError('The configured customer document bucket does not exist. Check AWS_S3_CUSTOMER_DOCUMENT_BUCKET or AWS_S3_BUCKET_NAME.', 503);
      throw new AppError(`Customer document upload failed in storage (${errorCode}). Check backend logs and retry with a new upload.`, 503);
    }
  },
  async prepareLeadConversionUploads(actorId: Types.ObjectId, leadId: Types.ObjectId, uploadIds: string[]) {
    if (uploadIds.length !== CUSTOMER_DOCUMENT_TYPES.length || uploadIds.some((id) => !Types.ObjectId.isValid(id)) || new Set(uploadIds).size !== CUSTOMER_DOCUMENT_TYPES.length) {
      throw new AppError('Upload one file for each required customer document before conversion', 400);
    }
    const uploads = await CustomerDocumentUploadModel.find({
      _id: { $in: uploadIds },
      lead: leadId,
      owner: actorId,
      status: 'PENDING',
      uploadedAt: { $ne: null },
      expiresAt: { $gt: new Date() }
    });
    const suppliedTypes = new Set(uploads.map((upload) => upload.documentType));
    if (uploads.length !== CUSTOMER_DOCUMENT_TYPES.length || CUSTOMER_DOCUMENT_TYPES.some((type) => !suppliedTypes.has(type))) {
      throw new AppError('Upload one file for each required customer document: PAN, AADHAAR, ELECTRICITY_BILL, and BANK_PASSBOOK', 400);
    }
    const claimed = await CustomerDocumentUploadModel.updateMany(
      { _id: { $in: uploads.map((upload) => upload._id) }, lead: leadId, owner: actorId, status: 'PENDING', uploadedAt: { $ne: null }, expiresAt: { $gt: new Date() } },
      { $set: { status: 'VERIFYING' } }
    );
    if (claimed.modifiedCount !== CUSTOMER_DOCUMENT_TYPES.length) throw new AppError('Document uploads have expired or are already being used; upload them again', 409);

    try {
      const storageClient = storage();
      for (const upload of uploads) {
        const head = await storageClient.send(new HeadObjectCommand({ Bucket: env.awsCustomerDocumentBucketName, Key: upload.key }));
        if (head.ContentLength !== upload.size || head.ContentType !== upload.contentType || head.ServerSideEncryption !== 'AES256') throw new AppError(`${upload.documentType} upload does not match the declared file type or size`, 400);
        const response = await storageClient.send(new GetObjectCommand({ Bucket: env.awsCustomerDocumentBucketName, Key: upload.key }));
        if (!response.Body) throw new AppError(`${upload.documentType} upload could not be read`, 400);
        const bytes = await response.Body.transformToByteArray();
        if (bytes.byteLength !== upload.size || !verifyMagic(upload.contentType, bytes)) throw new AppError(`${upload.documentType} file content does not match its declared type`, 400);
      }
      return uploads;
    } catch (error) {
      await CustomerDocumentUploadModel.updateMany({ _id: { $in: uploads.map((upload) => upload._id) }, status: 'VERIFYING' }, { $set: { status: 'REVOKED' } });
      if (error instanceof AppError) throw error;
      throw new AppError('Unable to verify required customer documents', 400);
    }
  },
  async createDocumentsForConversion(actorId: Types.ObjectId, customerId: Types.ObjectId, uploads: Array<InstanceType<typeof CustomerDocumentUploadModel>>, session?: ClientSession) {
    const documentData = uploads.map((upload) => ({
      customer: customerId,
      documentType: upload.documentType,
      fileName: upload.fileName,
      s3Key: upload.key,
      mimeType: upload.contentType,
      fileSize: upload.size,
      uploadedBy: actorId,
      verificationStatus: 'PENDING',
      uploadReservation: upload._id
    }));
    if (session) {
      await CustomerDocumentModel.create(documentData, { session, ordered: true });
      await CustomerActivityModel.create(uploads.map((upload) => ({
        customer: customerId,
        action: 'DOCUMENT_UPLOADED',
        description: `${upload.documentType} document uploaded`,
        actor: actorId
      })), { session, ordered: true });
      await CustomerDocumentUploadModel.updateMany({ _id: { $in: uploads.map((upload) => upload._id) }, status: 'VERIFYING' }, { $set: { status: 'COMPLETED', customer: customerId }, $unset: { lead: 1 } }, { session });
      return;
    }
    await CustomerDocumentModel.create(documentData);
    await CustomerActivityModel.create(uploads.map((upload) => ({
      customer: customerId,
      action: 'DOCUMENT_UPLOADED',
      description: `${upload.documentType} document uploaded`,
      actor: actorId
    })));
    await CustomerDocumentUploadModel.updateMany({ _id: { $in: uploads.map((upload) => upload._id) }, status: 'VERIFYING' }, { $set: { status: 'COMPLETED', customer: customerId }, $unset: { lead: 1 } });
  },
  async revokeLeadConversionUploads(uploads: Array<InstanceType<typeof CustomerDocumentUploadModel>>) {
    await CustomerDocumentUploadModel.updateMany({ _id: { $in: uploads.map((upload) => upload._id) }, status: 'VERIFYING' }, { $set: { status: 'REVOKED' } });
  },
  async createUploadUrl(actorId: Types.ObjectId, customerId: string, input: { documentType: CustomerDocumentType; fileName: string; mimeType: string; fileSize: number }) {
    const customer = await assertCustomerAccess(actorId, parseId(customerId, 'customer ID'));
    const ext = MIME_EXTENSIONS.get(input.mimeType);
    if (!ext) throw new AppError('Only PDF, JPEG, PNG, and WebP documents are accepted', 400);
    if (!Number.isInteger(input.fileSize) || input.fileSize < 1 || input.fileSize > env.customerDocumentMaxSizeBytes) throw new AppError('Document size exceeds the configured limit', 400);
    const key = `customer-documents/${customer._id.toString()}/${randomUUID()}.${ext}`;
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000);
    const upload = await CustomerDocumentUploadModel.create({ customer: customer._id, owner: actorId, documentType: input.documentType, fileName: safeFileName(input.fileName), key, contentType: input.mimeType, size: input.fileSize, expiresAt, status: 'PENDING' });
    try {
      const command = new PutObjectCommand({ Bucket: env.awsCustomerDocumentBucketName, Key: key, ContentType: input.mimeType, ContentLength: input.fileSize, ServerSideEncryption: 'AES256', Metadata: { customer: customer._id.toString(), uploader: actorId.toString() } });
      const url = await getSignedUrl(storage(), command, { expiresIn: UPLOAD_TTL_SECONDS });
      return { uploadId: upload._id.toString(), uploadUrl: url, expiresAt };
    } catch (error) { await CustomerDocumentUploadModel.deleteOne({ _id: upload._id }); throw error; }
  },
  async completeUpload(actorId: Types.ObjectId, customerId: string, uploadId: string) {
    if (!Types.ObjectId.isValid(customerId) || !Types.ObjectId.isValid(uploadId)) throw new AppError('Invalid customer or upload ID', 400);
    const customer = await assertCustomerAccess(actorId, parseId(customerId, 'customer ID'));
    const upload = await CustomerDocumentUploadModel.findOneAndUpdate({ _id: uploadId, customer: customer._id, owner: actorId, status: 'PENDING', expiresAt: { $gt: new Date() } }, { $set: { status: 'VERIFYING' } }, { new: true });
    if (!upload) {
      const existing = await CustomerDocumentModel.findOne({ uploadReservation: uploadId, customer: customer._id }).lean();
      if (existing) return existing;
      throw new AppError('Document upload is invalid, expired, or already being processed', 400);
    }
    try {
      const storageClient = storage();
      const head = await storageClient.send(new HeadObjectCommand({ Bucket: env.awsCustomerDocumentBucketName, Key: upload.key }));
      if (head.ContentLength !== upload.size || head.ContentType !== upload.contentType || head.ServerSideEncryption !== 'AES256') throw new AppError('Uploaded document does not match the declared file type or size', 400);
      const response = await storageClient.send(new GetObjectCommand({ Bucket: env.awsCustomerDocumentBucketName, Key: upload.key }));
      if (!response.Body) throw new AppError('Uploaded document could not be read', 400);
      const bytes = await response.Body.transformToByteArray();
      if (bytes.byteLength !== upload.size || !verifyMagic(upload.contentType, bytes)) throw new AppError('Uploaded file content does not match its declared type', 400);
    } catch (error) {
      upload.status = 'REVOKED'; await upload.save();
      if (error instanceof AppError) throw error;
      throw new AppError('Unable to verify uploaded customer document', 400);
    }
    let document;
    try {
      document = await CustomerDocumentModel.create({ customer: customer._id, documentType: upload.documentType, fileName: upload.fileName, s3Key: upload.key, mimeType: upload.contentType, fileSize: upload.size, uploadedBy: actorId, verificationStatus: 'PENDING', uploadReservation: upload._id });
    } catch (error) {
      upload.status = 'REVOKED'; await upload.save();
      throw error;
    }
    upload.status = 'COMPLETED'; await upload.save();
    await CustomerActivityModel.create({ customer: customer._id, action: 'DOCUMENT_UPLOADED', description: `${upload.documentType} document uploaded`, actor: actorId });
    return document;
  },
  async list(actorId: Types.ObjectId, customerId: string) {
    const customer = await assertCustomerAccess(actorId, parseId(customerId, 'customer ID'));
    return CustomerDocumentModel.find({ customer: customer._id }).select('-s3Key').populate('uploadedBy', 'employeeCode firstName lastName').populate('verifiedBy', 'employeeCode firstName lastName').sort({ uploadedAt: -1 }).lean();
  },
  async downloadUrl(actorId: Types.ObjectId, customerId: string, documentId: string) {
    const customer = await assertCustomerAccess(actorId, parseId(customerId, 'customer ID'));
    const document = await CustomerDocumentModel.findOne({ _id: parseId(documentId, 'document ID'), customer: customer._id }).select('s3Key fileName');
    if (!document) throw new AppError('Customer document not found', 404);
    const command = new GetObjectCommand({ Bucket: env.awsCustomerDocumentBucketName, Key: document.s3Key, ResponseContentDisposition: `attachment; filename="${safeFileName(document.fileName)}"` });
    const url = await getSignedUrl(storage(), command, { expiresIn: 300 });
    return { url, expiresInSeconds: 300 };
  },
  async previewUrl(actorId: Types.ObjectId, customerId: string, documentId: string) {
    const customer = await assertCustomerAccess(actorId, parseId(customerId, 'customer ID'));
    const document = await CustomerDocumentModel.findOne({ _id: parseId(documentId, 'document ID'), customer: customer._id }).select('s3Key fileName mimeType');
    if (!document) throw new AppError('Customer document not found', 404);
    const command = new GetObjectCommand({
      Bucket: env.awsCustomerDocumentBucketName,
      Key: document.s3Key,
      ResponseContentType: document.mimeType,
      ResponseContentDisposition: `inline; filename="${safeFileName(document.fileName)}"`
    });
    const url = await getSignedUrl(storage(), command, { expiresIn: 300 });
    return { url, contentType: document.mimeType, expiresInSeconds: 300 };
  },
  async verify(actorId: Types.ObjectId, customerId: string, documentId: string, status: 'VERIFIED' | 'REJECTED', remark?: string) {
    const customer = await assertCustomerAccess(actorId, parseId(customerId, 'customer ID'));
    const document = await CustomerDocumentModel.findOne({ _id: parseId(documentId, 'document ID'), customer: customer._id });
    if (!document) throw new AppError('Customer document not found', 404);
    document.verificationStatus = status; document.verifiedBy = actorId; document.verifiedAt = new Date(); document.verificationRemark = remark || null;
    await document.save();
    await CustomerActivityModel.create({ customer: customer._id, action: 'DOCUMENT_VERIFIED', description: `${document.documentType} document marked ${status}${remark ? `: ${remark}` : ''}`, actor: actorId });
    return document;
  }
};
