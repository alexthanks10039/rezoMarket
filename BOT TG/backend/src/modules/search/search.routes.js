import { Router } from 'express';
import { requireAdminKey } from '../shared/admin-auth.js';
import { rebuildCatalogIndex, searchCatalog } from './opensearch.service.js';

export const searchRouter = Router();

searchRouter.get('/api/shop/search', async (req, res) => {
  try {
    const result = await searchCatalog(req.query || {});
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[shop.search.error]', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

searchRouter.post('/api/admin/shop/search/reindex', requireAdminKey, async (_req, res) => {
  try {
    const result = await rebuildCatalogIndex();
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('[shop.search.reindex_error]', error);
    res.status(500).json({ success: false, message: 'Search reindex failed' });
  }
});

