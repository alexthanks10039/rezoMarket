const readEnv = (key, fallback = '') => {
  const value = process.env[key];
  return value === undefined || value === null || value === '' ? fallback : value;
};

const readBooleanEnv = (key, fallback = false) => {
  const value = String(readEnv(key, fallback ? 'true' : 'false')).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
};

export const getBackendConfig = () => {
  const webhookPath = readEnv('WEBHOOK_PATH', '/api/telegram/webhook');
  const publicBaseUrl = readEnv('PUBLIC_BASE_URL').replace(/\/+$/, '');

  return {
    port: Number(readEnv('PORT', '3000')),
    telegramToken: readEnv('TG_KEY'),
    ownerId: readEnv('OWNER_ID'),
    miniAppUrl: readEnv('MINI_APP_URL'),
    botUpdateMode: readEnv('BOT_UPDATE_MODE', 'webhook').toLowerCase(),
    publicBaseUrl,
    webhookPath: webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`,
    siteOrigin: readEnv('SITE_ORIGIN', 'http://127.0.0.1:4174'),
    pollingTimeoutSeconds: Number(readEnv('POLLING_TIMEOUT_SECONDS', '25')),
    pollingRetryMs: Number(readEnv('POLLING_RETRY_MS', '3000')),
    deleteWebhookOnPolling: readBooleanEnv('DELETE_WEBHOOK_ON_POLLING', true),
  };
};

export const requireTelegramToken = () => {
  const { telegramToken } = getBackendConfig();

  if (!telegramToken) {
    throw new Error('TG_KEY is not configured');
  }

  return telegramToken;
};

export const requireOwnerId = () => {
  const { ownerId } = getBackendConfig();

  if (!ownerId) {
    throw new Error('OWNER_ID is not configured');
  }

  return ownerId;
};

export const getPublicWebhookUrl = () => {
  const { publicBaseUrl, webhookPath } = getBackendConfig();

  if (!publicBaseUrl) {
    throw new Error('PUBLIC_BASE_URL is not configured');
  }

  return `${publicBaseUrl}${webhookPath}`;
};
