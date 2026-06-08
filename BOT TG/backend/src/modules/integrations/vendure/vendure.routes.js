import { Router } from 'express';
import { requireAdminKey } from '../../shared/admin-auth.js';
import { handleVendureWebhook, verifyVendureSignature } from './vendure.webhooks.js';
import {
  listProductKnowledgeSnapshots,
  listVendureSyncLogs,
  rebuildShopRag,
  syncOrdersFromVendure,
  syncProductsFromVendure,
} from './vendure.sync.service.js';

export const vendureIntegrationRouter = Router();

vendureIntegrationRouter.post('/api/integrations/vendure/webhook', async (req, res) => {
  if (!verifyVendureSignature(req)) {
    return res.status(401).json({ success: false, message: 'Invalid Vendure webhook signature' });
  }

  try {
    const result = await handleVendureWebhook(req.body || {});
    return res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('[vendure.webhook.error]', error);
    return res.status(500).json({ success: false, message: 'Vendure webhook handling failed' });
  }
});

vendureIntegrationRouter.post('/api/admin/integrations/vendure/sync-products', requireAdminKey, async (_req, res) => {
  try {
    const result = await syncProductsFromVendure();
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('[vendure.sync_products.error]', error);
    res.status(500).json({ success: false, message: 'Vendure product sync failed' });
  }
});

vendureIntegrationRouter.post('/api/admin/integrations/vendure/sync-orders', requireAdminKey, async (_req, res) => {
  try {
    const result = await syncOrdersFromVendure();
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('[vendure.sync_orders.error]', error);
    res.status(500).json({ success: false, message: 'Vendure order sync failed' });
  }
});

vendureIntegrationRouter.get('/api/admin/integrations/vendure/sync-logs', requireAdminKey, (_req, res) => {
  res.json({ success: true, items: listVendureSyncLogs() });
});

vendureIntegrationRouter.post('/api/admin/shop/rag/rebuild', requireAdminKey, async (_req, res) => {
  try {
    const result = await rebuildShopRag();
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('[shop.rag_rebuild.error]', error);
    res.status(500).json({ success: false, message: 'Shop RAG rebuild failed' });
  }
});

vendureIntegrationRouter.get('/api/admin/shop/rag/snapshots', requireAdminKey, (_req, res) => {
  res.json({ success: true, items: listProductKnowledgeSnapshots() });
});

