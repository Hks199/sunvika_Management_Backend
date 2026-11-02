import 'dotenv/config';
import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(5000),
  API_PREFIX: Joi.string().pattern(/^\/[a-zA-Z0-9/_-]+$/).default('/api/v1'),
  PUBLIC_API_URL: Joi.string().uri({ scheme: ['http', 'https'] }).allow('').default(''),
  MONGODB_URI: Joi.string().uri({ scheme: ['mongodb', 'mongodb+srv'] }).required(),
  MONGODB_MAX_POOL_SIZE: Joi.number().integer().min(5).max(200).default(50),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: Joi.number().integer().min(1).max(90).default(30),
  FRONTEND_URL: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string().allow('').default(''),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  AWS_REGION: Joi.string().allow('').default(''),
  AWS_S3_BUCKET_NAME: Joi.string().allow('').default(''),
  AWS_S3_PROFILE_BUCKET: Joi.string().allow('').default(''),
  AWS_S3_CUSTOMER_DOCUMENT_BUCKET: Joi.string().allow('').default(''),
  AWS_S3_QUOTATION_BUCKET: Joi.string().allow('').default(''),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  PROFILE_IMAGE_MAX_SIZE_BYTES: Joi.number().integer().min(1024).max(10485760).default(5242880),
  CUSTOMER_DOCUMENT_MAX_SIZE_BYTES: Joi.number().integer().min(1024).max(20971520).default(10485760),
  QUOTATION_COMPANY_ADDRESS: Joi.string().max(500).allow('').default(''),
  QUOTATION_COMPANY_PHONE: Joi.string().max(50).allow('').default(''),
  QUOTATION_COMPANY_EMAIL: Joi.string().email().allow('').default(''),
  QUOTATION_AUTHORIZED_SIGNATORY: Joi.string().max(120).allow('').default('Authorized Signatory'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent').default('info'),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(200),
  JSON_BODY_LIMIT: Joi.string().default('1mb'),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true)
}).unknown(true);

const { error, value } = schema.validate(process.env, { abortEarly: false, convert: true });
if (error) {
  throw new Error(`Invalid environment configuration: ${error.details.map(({ message }) => message).join('; ')}`);
}
if (Boolean(value.AWS_ACCESS_KEY_ID) !== Boolean(value.AWS_SECRET_ACCESS_KEY)) {
  throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together');
}
if (value.NODE_ENV === 'production' && !value.PUBLIC_API_URL) {
  throw new Error('PUBLIC_API_URL is required in production for quotation share links');
}
if (value.NODE_ENV === 'production') {
  const secureOrigins = [value.PUBLIC_API_URL, value.FRONTEND_URL, ...(value.CORS_ORIGINS as string).split(',').map((origin) => origin.trim())];
  if (secureOrigins.some((origin) => !origin || new URL(origin).protocol !== 'https:')) {
    throw new Error('Production API, frontend, and CORS origins must use HTTPS');
  }
  if ((value.JWT_ACCESS_SECRET as string).toLowerCase().includes('replace-with')) {
    throw new Error('JWT_ACCESS_SECRET must be replaced before production startup');
  }
  const mongoUrl = new URL(value.MONGODB_URI as string);
  if (mongoUrl.protocol === 'mongodb:' && !['true', '1'].includes(mongoUrl.searchParams.get('tls') ?? mongoUrl.searchParams.get('ssl') ?? '')) {
    throw new Error('Production MongoDB connections must use TLS');
  }
}

const origins = (value.CORS_ORIGINS as string).split(',').map((origin) => origin.trim()).filter(Boolean);

export const env = Object.freeze({
  nodeEnv: value.NODE_ENV as 'development' | 'test' | 'production',
  port: value.PORT as number,
  apiPrefix: (value.API_PREFIX as string).replace(/\/$/, ''),
  publicApiUrl: ((value.PUBLIC_API_URL as string) || `http://localhost:${value.PORT}${(value.API_PREFIX as string).replace(/\/$/, '')}`).replace(/\/$/, ''),
  mongoUri: value.MONGODB_URI as string,
  mongoMaxPoolSize: value.MONGODB_MAX_POOL_SIZE as number,
  jwtAccessSecret: value.JWT_ACCESS_SECRET as string,
  jwtAccessExpiresIn: value.JWT_ACCESS_EXPIRES_IN as string,
  refreshTokenExpiresDays: value.REFRESH_TOKEN_EXPIRES_DAYS as number,
  frontendUrl: (value.FRONTEND_URL as string).replace(/\/$/, ''),
  smtpHost: value.SMTP_HOST as string,
  smtpPort: value.SMTP_PORT as number,
  smtpSecure: value.SMTP_SECURE as boolean,
  smtpUser: value.SMTP_USER as string,
  smtpPassword: value.SMTP_PASSWORD as string,
  smtpFrom: value.SMTP_FROM as string,
  bcryptSaltRounds: value.BCRYPT_SALT_ROUNDS as number,
  awsRegion: value.AWS_REGION as string,
  awsBucketName: (value.AWS_S3_PROFILE_BUCKET || value.AWS_S3_BUCKET_NAME) as string,
  awsCustomerDocumentBucketName: (value.AWS_S3_CUSTOMER_DOCUMENT_BUCKET || value.AWS_S3_BUCKET_NAME || value.AWS_S3_PROFILE_BUCKET) as string,
  awsQuotationBucketName: (value.AWS_S3_QUOTATION_BUCKET || value.AWS_S3_BUCKET_NAME) as string,
  awsAccessKeyId: value.AWS_ACCESS_KEY_ID as string,
  awsSecretAccessKey: value.AWS_SECRET_ACCESS_KEY as string,
  profileImageMaxSizeBytes: value.PROFILE_IMAGE_MAX_SIZE_BYTES as number,
  customerDocumentMaxSizeBytes: value.CUSTOMER_DOCUMENT_MAX_SIZE_BYTES as number,
  quotationCompanyAddress: value.QUOTATION_COMPANY_ADDRESS as string,
  quotationCompanyPhone: value.QUOTATION_COMPANY_PHONE as string,
  quotationCompanyEmail: value.QUOTATION_COMPANY_EMAIL as string,
  quotationAuthorizedSignatory: value.QUOTATION_AUTHORIZED_SIGNATORY as string,
  corsOrigins: origins,
  logLevel: value.LOG_LEVEL as string,
  rateLimitWindowMs: value.RATE_LIMIT_WINDOW_MS as number,
  rateLimitMax: value.RATE_LIMIT_MAX as number,
  jsonBodyLimit: value.JSON_BODY_LIMIT as string,
  swaggerEnabled: value.SWAGGER_ENABLED as boolean
});
