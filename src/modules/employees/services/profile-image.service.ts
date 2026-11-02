import { randomUUID } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Types } from 'mongoose';
import { env } from '../../../config/env.config.js';
import { AppError } from '../../../utils/app-error.util.js';
import { logger } from '../../../services/logger.service.js';
import { ProfileImageUploadModel } from '../models/profile-image-upload.model.js';

const UPLOAD_TTL_MS = 15 * 60 * 1000;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);
let client: S3Client | undefined;

function getClient(): S3Client {
  if (!env.awsRegion || !env.awsBucketName) throw new AppError('Profile image storage is not configured', 503);
  if (!client) {
    const credentialsConfigured = env.awsAccessKeyId.length > 0 && env.awsSecretAccessKey.length > 0;
    client = new S3Client({
      region: env.awsRegion,
      followRegionRedirects: true,
      ...(credentialsConfigured ? { credentials: { accessKeyId: env.awsAccessKeyId, secretAccessKey: env.awsSecretAccessKey } } : {})
    });
  }
  return client;
}

function verifyImageMagic(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.subarray(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  return contentType === 'image/webp'
    && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP';
}

async function reserveUpload(ownerId: Types.ObjectId, contentType: string, size: number) {
  const extension = ALLOWED_TYPES.get(contentType);
  if (!extension) throw new AppError('Only JPEG, PNG, and WebP profile images are allowed', 400);
  if (!Number.isInteger(size) || size < 1 || size > env.profileImageMaxSizeBytes) throw new AppError('Profile image size exceeds the allowed limit', 400);
  const storage = getClient();
  const key = `employee-profile-images/${ownerId.toString()}/${randomUUID()}.${extension}`;
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
  const upload = await ProfileImageUploadModel.create({ owner: ownerId, key, contentType, size, expiresAt });
  return { upload, expiresAt, storage };
}

export const profileImageService = {
  async createUploadReservation(ownerId: Types.ObjectId, contentType: string, size: number) {
    const { upload, expiresAt } = await reserveUpload(ownerId, contentType, size);
    return { uploadId: upload._id.toString(), expiresAt };
  },

  async createUploadUrl(ownerId: Types.ObjectId, contentType: string, size: number) {
    const { upload, expiresAt, storage } = await reserveUpload(ownerId, contentType, size);
    try {
      const command = new PutObjectCommand({
        Bucket: env.awsBucketName,
        Key: upload.key,
        ContentType: contentType,
        ContentLength: size,
        Metadata: { owner: ownerId.toString() }
      });
      const uploadUrl = await getSignedUrl(storage, command, { expiresIn: Math.floor(UPLOAD_TTL_MS / 1000) });
      return { uploadId: upload._id.toString(), uploadUrl, expiresAt };
    } catch (error) {
      await ProfileImageUploadModel.deleteOne({ _id: upload._id });
      throw error;
    }
  },

  async uploadReservedImage(ownerId: Types.ObjectId, uploadId: string, contentType: string, bytes: Uint8Array) {
    if (!Types.ObjectId.isValid(uploadId)) throw new AppError('Invalid profile image upload ID', 400);
    if (!ALLOWED_TYPES.has(contentType)) throw new AppError('Only JPEG, PNG, and WebP profile images are allowed', 400);
    if (bytes.byteLength < 1 || bytes.byteLength > env.profileImageMaxSizeBytes) throw new AppError('Profile image size exceeds the allowed limit', 400);
    if (!verifyImageMagic(contentType, bytes)) throw new AppError('Uploaded file is not a valid supported image', 400);
    const upload = await ProfileImageUploadModel.findOne({
      _id: uploadId,
      owner: ownerId,
      contentType,
      size: bytes.byteLength,
      claimedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    });
    if (!upload) throw new AppError('Profile image upload is invalid, expired, or does not match the selected file', 400);
    try {
      await getClient().send(new PutObjectCommand({
        Bucket: env.awsBucketName,
        Key: upload.key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.byteLength,
        Metadata: { owner: ownerId.toString() }
      }));
      return { uploadId: upload._id.toString() };
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Unknown S3 error');
      const errorCode = 'name' in failure && typeof failure.name === 'string' ? failure.name : 'UnknownStorageError';
      logger.error({ err: failure, uploadId, errorCode }, 'Failed to upload employee profile image');
      if (errorCode === 'AccessDenied') {
        throw new AppError('AWS denied the profile image upload. Grant the backend role s3:PutObject access to the configured profile image bucket.', 503);
      }
      if (errorCode === 'NoSuchBucket') {
        throw new AppError('The configured profile image bucket does not exist. Check AWS_S3_PROFILE_BUCKET or AWS_S3_BUCKET_NAME.', 503);
      }
      if (errorCode === 'InvalidAccessKeyId' || errorCode === 'SignatureDoesNotMatch') {
        throw new AppError('AWS rejected the backend storage credentials. Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.', 503);
      }
      throw new AppError(`AWS profile image upload failed (${errorCode}). Check the backend log for the S3 request details, or remove the optional image and retry.`, 503);
    }
  },

  async claimUpload(ownerId: Types.ObjectId, uploadId: string) {
    if (!Types.ObjectId.isValid(uploadId)) throw new AppError('Invalid profile image upload ID', 400);
    const now = new Date();
    const upload = await ProfileImageUploadModel.findOneAndUpdate(
      { _id: uploadId, owner: ownerId, claimedAt: null, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { claimedAt: now } },
      { new: true }
    );
    if (!upload) throw new AppError('Profile image upload is invalid, expired, or already used', 400);
    try {
      const result = await getClient().send(new GetObjectCommand({ Bucket: env.awsBucketName, Key: upload.key }));
      if (result.ContentLength !== upload.size || result.ContentType !== upload.contentType || !result.Body) {
        throw new AppError('Uploaded profile image does not match its declared type or size', 400);
      }
      const bytes = await result.Body.transformToByteArray();
      if (bytes.byteLength !== upload.size || !verifyImageMagic(upload.contentType, bytes)) {
        throw new AppError('Uploaded file is not a valid supported image', 400);
      }
      return { uploadId: upload._id, key: upload.key };
    } catch (error) {
      await ProfileImageUploadModel.updateOne({ _id: upload._id, claimedAt: now }, { $set: { revokedAt: new Date() } });
      if (error instanceof AppError) throw error;
      throw new AppError('Unable to verify the uploaded profile image', 400);
    }
  },

  async completeUpload(uploadId: Types.ObjectId, employeeId: Types.ObjectId): Promise<void> {
    await ProfileImageUploadModel.updateOne({ _id: uploadId, claimedAt: { $ne: null }, employee: null }, { $set: { employee: employeeId } });
  },

  async releaseUpload(uploadId: Types.ObjectId): Promise<void> {
    await ProfileImageUploadModel.updateOne({ _id: uploadId, employee: null }, { $set: { claimedAt: null } });
  },

  async createDownloadUrl(key: string): Promise<string> {
    if (!key.startsWith('employee-profile-images/')) throw new AppError('Profile image not found', 404);
    return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: env.awsBucketName, Key: key }), { expiresIn: 300 });
  }
};
