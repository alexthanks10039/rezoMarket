import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { leadsRouter } from './leads.routes.js';
import { botRouter } from './bot.routes.js';
import { shopRouter } from './shop/routes.js';
import { ragRouter } from './rag.routes.js';
import { vendureIntegrationRouter } from './modules/integrations/vendure/vendure.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { shopAnalyticsRouter } from './modules/shop-analytics/shop-analytics.routes.js';
import { selectionRouter } from './modules/selection/selection.routes.js';

const app = express();
const port = Number(process.env.PORT || 3000);

const fetchWithTimeout = async (url, options = {}, timeoutMs = 2500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const checkHttp = async (name, url, options = {}) => {
  if (!url) {
    return { ok: false, status: 'not_configured' };
  }

  try {
    const response = await fetchWithTimeout(url, options);
    return {
      ok: response.ok,
      status: response.status,
      url,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'unreachable',
      url,
      error: error.message,
      name,
    };
  }
};

const checkRag = async (url) => {
  const baseCheck = await checkHttp('rag', url);
  if (!baseCheck.ok) {
    return baseCheck;
  }

  try {
    const response = await fetchWithTimeout(url);
    const payload = await response.json();
    return {
      ...baseCheck,
      indexReady: payload.indexReady === true,
      index: payload.index || null,
    };
  } catch (error) {
    return {
      ...baseCheck,
      indexReady: false,
      indexError: error.message,
    };
  }
};

app.use(cors());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer.toString('utf8');
  },
}));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'bot-tg-backend',
  });
});

app.get('/health/deep', async (_req, res) => {
  const opensearchUrl = (process.env.OPENSEARCH_NODE || process.env.OPENSEARCH_URL || '').replace(/\/$/, '');
  const vendureUrl = (process.env.VENDURE_API_URL || '').replace(/\/$/, '');
  const ragUrl = (process.env.RAG_SERVICE_URL || '').replace(/\/$/, '');

  const checks = {
    opensearch: await checkHttp('opensearch', opensearchUrl ? `${opensearchUrl}/_cluster/health` : ''),
    vendure: await checkHttp('vendure', vendureUrl ? `${vendureUrl}/health` : ''),
    rag: await checkRag(ragUrl ? `${ragUrl}/health` : ''),
  };
  const ok = Object.values(checks).every((check) => check.ok);

  res.status(ok ? 200 : 207).json({
    ok,
    service: 'bot-tg-backend',
    checks,
  });
});

app.use(leadsRouter);
app.use(shopRouter);
app.use(searchRouter);
app.use(shopAnalyticsRouter);
app.use(selectionRouter);
app.use(ragRouter);
app.use(vendureIntegrationRouter);
app.use(botRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

app.listen(port, () => {
  console.log(`[bot-tg-backend] listening on http://localhost:${port}`);
});
