import { Router } from 'express';
import * as shopStore from '../../shop/store.js';
import { requireAdminKey } from '../shared/admin-auth.js';

export const selectionRouter = Router();

selectionRouter.get('/api/admin/shop/selection-requests', requireAdminKey, (_req, res) => {
  res.json({ success: true, items: shopStore.listSelectionRequests() });
});

selectionRouter.patch('/api/admin/shop/selection-requests/:id/status', requireAdminKey, (req, res) => {
  const status = String(req.body?.status || '').trim();
  if (!status) {
    return res.status(400).json({ success: false, message: 'status is required' });
  }

  const request = shopStore.updateSelectionRequestStatus(req.params.id, status);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Selection request not found' });
  }

  return res.json({ success: true, request });
});

