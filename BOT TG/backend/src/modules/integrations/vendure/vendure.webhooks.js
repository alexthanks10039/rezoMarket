import crypto from 'crypto';
import { createLeadRecord } from '../../../leads.store.js';
import { sendOwnerLeadNotification } from '../../../telegram.service.js';
import { createAnalyticsEvent } from '../../shop-analytics/shop-analytics.service.js';
import { indexProductFromVendure, removeProductFromIndex } from '../../search/opensearch.service.js';
import { logVendureSync, upsertProductKnowledgeSnapshot } from './vendure.sync.service.js';

const getEventType = (payload) => payload?.eventType || payload?.type || payload?.name || payload?.event;

const getEntity = (payload) => payload?.entity || payload?.data || payload?.product || payload?.order || payload;

export const verifyVendureSignature = (req) => {
  const secret = process.env.VENDURE_WEBHOOK_SECRET;
  if (!secret) return true;

  const signature = req.headers['x-vendure-signature'] || req.headers['x-webhook-signature'];
  if (!signature) return false;

  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const normalizedSignature = String(signature).replace(/^sha256=/, '');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(normalizedSignature);
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const notifyOrder = async (order) => {
  const customer = order.customer || {};
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || order.customerName || 'Клиент';
  const phone = customer.phoneNumber || order.phone || '';
  const items = (order.lines || order.items || [])
    .map((line) => {
      const title = line.productVariant?.name || line.title || 'Товар';
      return `${title} x${line.quantity || 1}`;
    })
    .join(', ');

  const lead = createLeadRecord({
    name,
    phone,
    service: 'Магазин Мир Сальников',
    objectType: 'vendure_order',
    comment: `Новый заказ из Vendure ${order.code || order.id}. Товары: ${items}`,
    calculatedPrice: order.totalWithTax || order.totalAmount,
    source: 'vendure_order',
    sourcePage: process.env.VENDURE_ADMIN_URL ? `${process.env.VENDURE_ADMIN_URL}/orders/${order.id}` : '/admin/orders',
    meta: {
      vendureOrderId: order.id,
      code: order.code,
      state: order.state,
    },
  });

  await sendOwnerLeadNotification(lead);
  return lead;
};

export const handleVendureWebhook = async (payload) => {
  const eventType = getEventType(payload);
  const entity = getEntity(payload);
  const entityId = entity?.id || payload?.id || null;

  if (!eventType) {
    logVendureSync({
      eventType: 'unknown',
      entityType: 'unknown',
      vendureEntityId: entityId,
      status: 'ignored',
      payload,
      errorMessage: 'Webhook event type is missing',
    });
    return { handled: false, reason: 'missing_event_type' };
  }

  if (/productVariant\.(created|updated|deleted)|stock\.updated/i.test(eventType)) {
    const product = payload.product || entity.product || entity;
    if (/deleted/i.test(eventType)) {
      await removeProductFromIndex(entityId);
    } else {
      await indexProductFromVendure(product);
      upsertProductKnowledgeSnapshot(product);
    }
    logVendureSync({ eventType, entityType: 'productVariant', vendureEntityId: entityId, payload });
    return { handled: true, entityType: 'productVariant' };
  }

  if (/product\.(created|updated|deleted)/i.test(eventType)) {
    if (/deleted/i.test(eventType)) {
      await removeProductFromIndex(entityId);
    } else {
      await indexProductFromVendure(entity);
      upsertProductKnowledgeSnapshot(entity);
    }
    logVendureSync({ eventType, entityType: 'product', vendureEntityId: entityId, payload });
    return { handled: true, entityType: 'product' };
  }

  if (/order\.(created|placed)|order\.stateTransition/i.test(eventType)) {
    createAnalyticsEvent({
      eventType: eventType.includes('stateTransition') ? 'vendure_order_state_transition' : 'vendure_order_created',
      vendureOrderId: entityId,
      value: entity.totalWithTax || entity.totalAmount,
      source: 'vendure_webhook',
      meta: { code: entity.code, state: entity.state },
    });

    if (/order\.(created|placed)/i.test(eventType)) {
      try {
        await notifyOrder(entity);
      } catch (error) {
        console.error('[vendure.webhook.telegram_error]', error.message);
      }
    }

    logVendureSync({ eventType, entityType: 'order', vendureEntityId: entityId, payload });
    return { handled: true, entityType: 'order' };
  }

  if (/customer\.created/i.test(eventType)) {
    logVendureSync({ eventType, entityType: 'customer', vendureEntityId: entityId, payload });
    return { handled: true, entityType: 'customer' };
  }

  logVendureSync({
    eventType,
    entityType: 'unknown',
    vendureEntityId: entityId,
    status: 'ignored',
    payload,
  });
  return { handled: false, reason: 'event_not_supported' };
};

