import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env.config.js';
import { AppError } from '../../utils/app-error.util.js';
import { EXCEL_TYPE } from './calling-list.excel.js';
let client: S3Client | undefined;
function storage() {
  if (!env.awsRegion || !env.awsCallingListBucketName) throw new AppError('Calling list S3 storage is not configured', 503);
  return client ??= new S3Client({ region: env.awsRegion, followRegionRedirects: true,
    ...(env.awsAccessKeyId ? { credentials: { accessKeyId: env.awsAccessKeyId, secretAccessKey: env.awsSecretAccessKey } } : {}) });
}
function storageFailure(error: unknown): never {
  const code = error instanceof Error ? error.name : 'StorageError';
  if (code === 'AccessDenied' || code === 'Forbidden') throw new AppError('Calling-list storage access denied. Grant the backend s3:PutObject, s3:GetObject and s3:DeleteObject on the calling-lists/* bucket prefix.', 503);
  if (code === 'NoSuchBucket') throw new AppError('The calling-list bucket does not exist. Check AWS_S3_CALLING_LIST_BUCKET.', 503);
  throw new AppError('Calling-list S3 storage is unavailable. Check the bucket configuration and backend AWS credentials.', 503);
}
export const callingListStorage = {
  async read(bucket: string, key: string) {
    try {
      const result = await storage().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error('Empty workbook');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) { storageFailure(error); }
  },
  async put(bucket: string, key: string, bytes: Buffer) {
    try { await storage().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: EXCEL_TYPE, ContentLength: bytes.length, ServerSideEncryption: 'AES256' })); } catch (error) { storageFailure(error); }
  },
  async remove(bucket: string, key: string) { await storage().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
  async download(bucket: string, key: string, fileName: string) {
    return getSignedUrl(storage(), new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: EXCEL_TYPE,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, ResponseCacheControl: 'private, no-store' }), { expiresIn: 60 });
  }
};
