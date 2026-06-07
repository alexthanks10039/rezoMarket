import { Router } from 'express';
import { sendOwnerLeadNotification } from './telegram.service.js';
import { createLeadRecord } from './leads.store.js';
import { requireOwnerAccess } from './owner-access.js';

export const leadsRouter = Router();

const required = (value) => String(value || '').trim().length > 0;

const normalizeLead = (body) => {
  const now = new Date();

  return {
    id: `lead_${now.getTime()}`,
    name: String(body.name || '').trim(),
    phone: String(body.phone || '').trim(),
    service: body.service || 'Магазин Мир Сальников',
    objectType: body.objectType || body.contactObjectType || body.object || '',
    address: body.address || body.district || body.contactArea || '',
    comment: body.comment || body.message || '',
    calculatorData: body.calculatorData || body.calculator || null,
    calculatedPrice: body.calculatedPrice || body.estimatedPrice || null,
    source: body.source || 'сайт',
    sourcePage: body.sourcePage || body.page || '',
    meta: body.meta || null,
    createdAt: now.toISOString(),
    status: 'new',
  };
};

const buildTestLeadBody = (body = {}) => ({
  name: 'Test lead',
  phone: '+7 700 000 00 00',
  service: 'Backend diagnostic',
  objectType: 'shop-test',
  address: 'local smoke test',
  comment: 'Diagnostic shop lead from POST /api/test-lead',
  calculatorData: {
    requestType: 'product-selection',
    category: 'salniki',
    size: '35x62x10',
    applianceType: 'Стиральная машина',
    preferredContact: 'telegram',
  },
  calculatedPrice: 2300,
  source: 'backend-diagnostic',
  sourcePage: '/api/test-lead',
  ...body,
});

leadsRouter.post('/api/leads', async (req, res) => {
  const normalizedLead = normalizeLead(req.body || {});

  if (!required(normalizedLead.name) || !required(normalizedLead.phone)) {
    return res.status(400).json({
      success: false,
      message: 'name and phone are required',
    });
  }

  const lead = createLeadRecord(normalizedLead);

  try {
    await sendOwnerLeadNotification(lead);

    return res.status(201).json({
      success: true,
      leadId: lead.id,
      status: lead.status,
      telegram: 'sent',
    });
  } catch (error) {
    console.error('[lead.telegram_error]', error);

    return res.status(202).json({
      success: true,
      leadId: lead.id,
      status: lead.status,
      telegram: 'failed',
      warning: 'Lead accepted, but Telegram notification failed',
    });
  }
});

leadsRouter.post('/api/test-lead', requireOwnerAccess, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const normalizedLead = normalizeLead(buildTestLeadBody(body));
  const lead = createLeadRecord(normalizedLead);

  try {
    await sendOwnerLeadNotification(lead);

    return res.status(201).json({
      success: true,
      test: true,
      leadId: lead.id,
      status: lead.status,
      telegram: 'sent',
    });
  } catch (error) {
    console.error('[test_lead.telegram_error]', error);

    return res.status(202).json({
      success: true,
      test: true,
      leadId: lead.id,
      status: lead.status,
      telegram: 'failed',
      warning: 'Test lead accepted, but Telegram notification failed',
    });
  }
});
