import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../../config/env.config.js';
import { AppError } from '../../../utils/app-error.util.js';

let client: S3Client | undefined;
function getClient(): S3Client {
  if (!env.awsRegion || !env.awsQuotationBucketName) throw new AppError('Quotation PDF storage is not configured', 503);
  if (!client) {
    const hasCredentials = Boolean(env.awsAccessKeyId && env.awsSecretAccessKey);
    client = new S3Client({ region: env.awsRegion, ...(hasCredentials ? { credentials: { accessKeyId: env.awsAccessKeyId, secretAccessKey: env.awsSecretAccessKey } } : {}) });
  }
  return client;
}

export const quotationStorageService = {
  async upload(key: string, body: Buffer, metadata: Record<string, string>) {
    await getClient().send(new PutObjectCommand({ Bucket: env.awsQuotationBucketName, Key: key, Body: body, ContentLength: body.byteLength, ContentType: 'application/pdf', ServerSideEncryption: 'AES256', Metadata: metadata }));
  },
  async download(key: string): Promise<Uint8Array> {
    const response = await getClient().send(new GetObjectCommand({ Bucket: env.awsQuotationBucketName, Key: key }));
    if (!response.Body) throw new AppError('Quotation PDF is missing from storage', 502);
    return response.Body.transformToByteArray();
  },
  async delete(key: string) {
    await getClient().send(new DeleteObjectCommand({ Bucket: env.awsQuotationBucketName, Key: key }));
  },
  async downloadUrl(key: string, fileName: string, seconds = 300) {
    const command = new GetObjectCommand({ Bucket: env.awsQuotationBucketName, Key: key, ResponseContentType: 'application/pdf', ResponseContentDisposition: `attachment; filename="${fileName.replace(/["\\/\r\n]/g, '_')}"` });
    return getSignedUrl(getClient(), command, { expiresIn: seconds });
  }
};
