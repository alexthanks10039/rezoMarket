import { Router } from 'express';
import { requireAdminKey } from '../shared/admin-auth.js';
import {
  createAnalyticsEvent,
  getAnalyticsSummary,
  getProductAnalytics,
  getSearchAnalytics,
} from './shop-analytics.service.js';

export const shopAnalyticsRouter = Router();

shopAnalyticsRouter.post('/api/shop/analytics/event', (req, res) => {
  const body = req.body || {};
  if (!body.eventType) {
    return res.status(400).json({ success: false, message: 'eventType is required' });
  }
  const event = createAnalyticsEvent(body);
  return res.status(201).json({ success: true, event });
});

shopAnalyticsRouter.get('/api/admin/shop/analytics/summary', requireAdminKey, (_req, res) => {
  res.json({ success: true, summary: getAnalyticsSummary() });
});

shopAnalyticsRouter.get('/api/admin/shop/analytics/searches', requireAdminKey, (_req, res) => {
  res.json({ success: true, ...getSearchAnalytics() });
});

shopAnalyticsRouter.get('/api/admin/shop/analytics/products', requireAdminKey, (_req, res) => {
  res.json({ success: true, ...getProductAnalytics() });
});

