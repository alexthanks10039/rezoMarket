import 'dotenv/config';
import { AdminUiPlugin } from '@vendure/admin-ui-plugin';
import { AssetServerPlugin } from '@vendure/asset-server-plugin';
import {
  DefaultLogger,
  DefaultSchedulerPlugin,
  DefaultSearchPlugin,
  dummyPaymentHandler,
  LanguageCode,
  LogLevel,
  RedisCachePlugin,
  VendureConfig,
} from '@vendure/core';
import { BullMQJobQueuePlugin } from '@vendure/job-queue-plugin/package/bullmq';
import path from 'path';
import { SvetWebhookPlugin } from './plugins/svet-webhook.plugin';

const bool = (value: string | undefined, fallback: boolean) => {
  if (value == null || value === '') return fallback;
  return value === 'true';
};

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value: string | undefined) => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const redisOptions = {
  host: process.env.REDIS_HOST || 'redis',
  port: int(process.env.REDIS_PORT, 6379),
  maxRetriesPerRequest: null,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
};

const productFields = [
  { name: 'externalSku', type: 'string' as const, nullable: true, public: true },
  { name: 'size', type: 'string' as const, nullable: true, public: true },
  { name: 'innerDiameter', type: 'float' as const, nullable: true, public: true },
  { name: 'outerDiameter', type: 'float' as const, nullable: true, public: true },
  { name: 'width', type: 'float' as const, nullable: true, public: true },
  { name: 'material', type: 'string' as const, nullable: true, public: true },
  { name: 'brand', type: 'string' as const, nullable: true, public: true },
  { name: 'applianceType', type: 'string' as const, nullable: true, public: true },
  { name: 'applianceBrand', type: 'string' as const, nullable: true, public: true },
  { name: 'applianceModel', type: 'string' as const, nullable: true, public: true },
  { name: 'compatibility', type: 'text' as const, nullable: true, public: true },
  { name: 'analogs', type: 'text' as const, nullable: true, public: true },
  { name: 'supplierCode', type: 'string' as const, nullable: true, public: false },
  { name: 'isPopular', type: 'boolean' as const, nullable: true, public: true },
  { name: 'searchKeywords', type: 'text' as const, nullable: true, public: true },
  { name: 'metaTitle', type: 'string' as const, nullable: true, public: true },
  { name: 'metaDescription', type: 'text' as const, nullable: true, public: true },
];

const variantFields = [
  { name: 'size', type: 'string' as const, nullable: true, public: true },
  { name: 'innerDiameter', type: 'float' as const, nullable: true, public: true },
  { name: 'outerDiameter', type: 'float' as const, nullable: true, public: true },
  { name: 'width', type: 'float' as const, nullable: true, public: true },
  { name: 'material', type: 'string' as const, nullable: true, public: true },
  { name: 'brand', type: 'string' as const, nullable: true, public: true },
  { name: 'applianceType', type: 'string' as const, nullable: true, public: true },
  { name: 'applianceBrand', type: 'string' as const, nullable: true, public: true },
  { name: 'applianceModel', type: 'string' as const, nullable: true, public: true },
  { name: 'compatibility', type: 'text' as const, nullable: true, public: true },
  { name: 'analogs', type: 'text' as const, nullable: true, public: true },
  { name: 'supplierCode', type: 'string' as const, nullable: true, public: false },
  { name: 'isPopular', type: 'boolean' as const, nullable: true, public: true },
  { name: 'searchKeywords', type: 'text' as const, nullable: true, public: true },
  { name: 'metaTitle', type: 'string' as const, nullable: true, public: true },
  { name: 'metaDescription', type: 'text' as const, nullable: true, public: true },
];

const orderFields = [
  { name: 'localOrderId', type: 'string' as const, nullable: true, public: false },
  { name: 'source', type: 'string' as const, nullable: true, public: false },
  { name: 'contactMethod', type: 'string' as const, nullable: true, public: false },
  { name: 'deliveryMethod', type: 'string' as const, nullable: true, public: false },
  { name: 'managerStatus', type: 'string' as const, nullable: true, public: false },
  { name: 'customerComment', type: 'text' as const, nullable: true, public: false },
];

export const config: VendureConfig = {
  apiOptions: {
    port: int(process.env.VENDURE_PORT, 3002),
    adminApiPath: process.env.VENDURE_ADMIN_API_PATH || 'admin-api',
    shopApiPath: process.env.VENDURE_SHOP_API_PATH || 'shop-api',
    cors: {
      origin: list(process.env.VENDURE_CORS_ORIGIN).length ? list(process.env.VENDURE_CORS_ORIGIN) : true,
      credentials: true,
    },
  },
  authOptions: {
    tokenMethod: ['bearer', 'cookie'],
    requireVerification: false,
    superadminCredentials: {
      identifier: process.env.SUPERADMIN_USERNAME || 'superadmin',
      password: process.env.SUPERADMIN_PASSWORD || 'superadmin',
    },
    cookieOptions: {
      secret: process.env.COOKIE_SECRET || 'change_me',
    },
  },
  dbConnectionOptions: {
    type: 'postgres',
    synchronize: bool(process.env.VENDURE_DB_SYNCHRONIZE, true),
    logging: false,
    host: process.env.VENDURE_DB_HOST || 'postgres',
    port: int(process.env.VENDURE_DB_PORT, 5432),
    username: process.env.VENDURE_DB_USER || 'vendure',
    password: process.env.VENDURE_DB_PASSWORD || 'vendure',
    database: process.env.VENDURE_DB_NAME || 'vendure_db',
    schema: process.env.VENDURE_DB_SCHEMA || 'public',
  },
  paymentOptions: {
    paymentMethodHandlers: [dummyPaymentHandler],
  },
  defaultLanguageCode: LanguageCode.ru,
  logger: new DefaultLogger({ level: process.env.NODE_ENV === 'production' ? LogLevel.Info : LogLevel.Debug }),
  customFields: {
    Product: productFields,
    ProductVariant: variantFields,
    Order: orderFields,
  },
  plugins: [
    AssetServerPlugin.init({
      route: 'assets',
      assetUploadDir: path.resolve(process.env.ASSET_UPLOAD_DIR || './static/assets'),
    }),
    DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
    BullMQJobQueuePlugin.init({
      connection: redisOptions,
      queueOptions: {
        prefix: process.env.REDIS_PREFIX || 'vendure-svet',
      },
      workerOptions: {
        prefix: process.env.REDIS_PREFIX || 'vendure-svet',
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 5000 },
      },
    }),
    RedisCachePlugin.init({
      namespace: process.env.REDIS_PREFIX || 'vendure-svet-cache',
      redisOptions,
    }),
    DefaultSchedulerPlugin.init({}),
    AdminUiPlugin.init({
      route: process.env.VENDURE_ADMIN_UI_ROUTE || 'admin',
      port: int(process.env.VENDURE_ADMIN_UI_PORT, 3003),
      adminUiConfig: {
        defaultLanguage: LanguageCode.ru,
        defaultLocale: 'ru-RU',
        availableLanguages: [LanguageCode.ru],
        availableLocales: ['ru-RU'],
      },
    }),
    SvetWebhookPlugin,
  ],
};
