import { Router } from 'express';
import { createLeadRecord } from '../leads.store.js';
import { importSeedCatalogToVendure } from '../modules/integrations/vendure/vendure.import.service.js';
import {
  applyVendureOrderAction,
  createVendureDraftOrderFromShopOrder,
  fetchVendureOrder,
  getVendureCommerceMethods,
  quoteVendureCheckout,
} from '../modules/integrations/vendure/vendure.order.service.js';
import { searchCatalog } from '../modules/search/opensearch.service.js';
import { sendOwnerLeadNotification } from '../telegram.service.js';
import * as shopStore from './store.js';

export const shopRouter = Router();

const formatValidationError = (message) => ({ success: false, message });

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  return normalized === 'true' ? true : normalized === 'false' ? false : undefined;
};

const parseNumber = (value) => {
  const result = Number(value);
  return Number.isNaN(result) ? undefined : result;
};

const requireAdminKey = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  if (!shopStore.isAdminKeyValid(key)) {
    return res.status(403).json({ success: false, message: 'Admin key required' });
  }
  return next();
};

shopRouter.get('/api/shop/categories', (_req, res) => {
  res.json({ items: shopStore.listCategories() });
});

shopRouter.get('/api/shop/filters', (_req, res) => {
  res.json(shopStore.getCatalogFilters());
});

shopRouter.get('/api/shop/commerce/methods', async (_req, res) => {
  try {
    const methods = await getVendureCommerceMethods();
    res.json({ success: true, ...methods });
  } catch (error) {
    console.error('[shop.commerce.methods_error]', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load commerce methods' });
  }
});

shopRouter.post('/api/shop/checkout/quote', async (req, res) => {
  try {
    const quote = await quoteVendureCheckout({ items: req.body?.items || [] });
    res.status(quote.ok ? 200 : 422).json({ success: quote.ok, quote });
  } catch (error) {
    console.error('[shop.checkout.quote_error]', error);
    res.status(500).json({ success: false, message: error.message || 'Checkout quote failed' });
  }
});

shopRouter.get('/api/shop/categories/:slug', async (req, res) => {
  const category = shopStore.getCategoryBySlug(req.params.slug);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }
  const products = (await searchCatalog({ category: category.slug, page: 1, limit: 100 })).items;
  return res.json({ category, products });
});

shopRouter.get('/api/shop/products', async (req, res) => {
  const query = req.query || {};
  const response = await searchCatalog({
    q: query.search,
    category: query.category,
    brand: query.brand,
    size: query.size,
    applianceType: query.applianceType,
    material: query.material,
    compatibility: query.compatibility,
    minPrice: parseNumber(query.minPrice),
    maxPrice: parseNumber(query.maxPrice),
    inStock: query.inStock,
    hasDiscount: parseBoolean(query.hasDiscount),
    sort: query.sort,
    page: parseNumber(query.page) || 1,
    limit: parseNumber(query.limit) || 12,
  });
  res.json(response);
});

shopRouter.get('/api/shop/products/:slug', async (req, res) => {
  const indexed = await searchCatalog({ slug: req.params.slug, page: 1, limit: 1 });
  if (indexed.items?.[0]) {
    return res.json({ product: { ...indexed.items[0], images: indexed.items[0].images || [], analogs: [] } });
  }

  const product = shopStore.getProductBySlug(req.params.slug);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  const analogs = shopStore.findProductsBySlugs(product.analogs || []);
  return res.json({ product: { ...product, analogs } });
});

shopRouter.post('/api/shop/cart', (req, res) => {
  const sessionId = String(req.body?.sessionId || '').trim() || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const cart = shopStore.getOrCreateCart(sessionId);
  return res.status(201).json({ success: true, cart, sessionId });
});

shopRouter.get('/api/shop/cart/:sessionId', (req, res) => {
  const cart = shopStore.getOrCreateCart(req.params.sessionId);
  if (!cart) {
    return res.status(400).json(formatValidationError('Session ID is required')); 
  }
  return res.json({ cart });
});

shopRouter.post('/api/shop/cart/items', (req, res) => {
  const { sessionId, productId, quantity } = req.body || {};
  if (!sessionId || !productId) {
    return res.status(400).json(formatValidationError('sessionId and productId are required')); 
  }

  const cart = shopStore.addCartItem(sessionId, productId, quantity || 1);
  if (!cart) {
    return res.status(404).json(formatValidationError('Product not found or cart could not be created')); 
  }

  return res.status(201).json({ success: true, cart });
});

shopRouter.patch('/api/shop/cart/items/:id', (req, res) => {
  const { sessionId, quantity } = req.body || {};
  if (!sessionId || quantity == null) {
    return res.status(400).json(formatValidationError('sessionId and quantity are required')); 
  }

  const cart = shopStore.updateCartItem(sessionId, req.params.id, quantity);
  if (!cart) {
    return res.status(404).json(formatValidationError('Cart item not found or invalid quantity')); 
  }

  return res.json({ success: true, cart });
});

shopRouter.delete('/api/shop/cart/items/:id', (req, res) => {
  const sessionId = String(req.query.sessionId || req.body?.sessionId || '').trim();
  if (!sessionId) {
    return res.status(400).json(formatValidationError('sessionId is required')); 
  }

  const cart = shopStore.removeCartItem(sessionId, req.params.id);
  if (!cart) {
    return res.status(404).json(formatValidationError('Cart item not found')); 
  }

  return res.json({ success: true, cart });
});

shopRouter.post('/api/shop/orders', async (req, res) => {
  const body = req.body || {};
  const requiredFields = ['customerName', 'phone', 'items'];
  for (const field of requiredFields) {
    if (!body[field]) {
      return res.status(400).json(formatValidationError(`${field} is required`));
    }
  }

  let checkoutQuote = null;
  try {
    checkoutQuote = await quoteVendureCheckout({ items: body.items });
  } catch (error) {
    console.error('[shop.order.quote_error]', error);
    return res.status(500).json(formatValidationError(error.message || 'Checkout quote failed'));
  }
  if (!checkoutQuote.ok) {
    return res.status(409).json({
      success: false,
      message: 'Some cart items are unavailable or changed',
      quote: checkoutQuote,
    });
  }

  const quotedItems = checkoutQuote.lines.map((line) => ({
    productId: line.productSlug || line.productId,
    slug: line.productSlug,
    title: line.title,
    sku: line.sku,
    price: line.unitPrice,
    quantity: line.quantity,
  }));

  const order = shopStore.createOrder({
    sessionId: body.sessionId,
    customerName: body.customerName,
    phone: body.phone,
    city: body.city,
    contactMethod: body.contactMethod,
    deliveryMethod: body.deliveryMethod,
    comment: body.comment,
    items: quotedItems,
    totalAmount: checkoutQuote.totalWithTax,
    source: body.source || 'shop',
  });

  const leadPayload = {
    name: order.customerName,
    phone: order.phone,
    service: 'Магазин Мир Сальников',
    objectType: order.deliveryMethod,
    address: order.city || '',
    comment: `Заказ ${order.id}. Товары: ${order.items.map((item) => `${item.title} x${item.quantity}`).join(', ')}. ${order.comment || ''}`,
    calculatorData: {
      items: order.items,
      total: order.totalAmount,
    },
    calculatedPrice: order.totalAmount,
    source: 'shop_order',
    sourcePage: body.sourcePage || '/cart',
    meta: { orderId: order.id, cartItems: order.items.length },
  };

  const lead = createLeadRecord(leadPayload);
  let telegramResult = 'skipped';
  let vendureResult = { ok: false, skipped: true, reason: 'not_attempted' };

  try {
    await sendOwnerLeadNotification(lead);
    telegramResult = 'sent';
  } catch (error) {
    console.error('[shop.order.telegram_error]', error);
    telegramResult = 'failed';
  }

  try {
    vendureResult = await createVendureDraftOrderFromShopOrder(order);
    if (vendureResult.ok && vendureResult.order) {
      shopStore.attachVendureOrder(order.id, vendureResult.order);
    }
  } catch (error) {
    console.error('[shop.order.vendure_draft_error]', error);
    vendureResult = { ok: false, error: error.message };
  }

  if (body.sessionId) {
    shopStore.clearCart(body.sessionId);
  }

  return res.status(201).json({
    success: true,
    order: shopStore.getOrderById(order.id) || order,
    quote: checkoutQuote,
    leadId: lead.id,
    telegram: telegramResult,
    vendure: vendureResult,
  });
});

shopRouter.post('/api/shop/selection-request', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.phone || !(body.message || body.applianceModel || body.partSize)) {
    return res.status(400).json(formatValidationError('name, phone and at least one selection field are required')); 
  }

  const selection = shopStore.createSelectionRequest({
    name: body.name,
    phone: body.phone,
    message: body.message,
    applianceModel: body.applianceModel,
    partSize: body.partSize,
    comment: body.comment,
    source: 'shop_selection',
  });

  const leadPayload = {
    name: selection.name,
    phone: selection.phone,
    service: 'Подбор детали',
    objectType: selection.applianceModel || 'подбор детали',
    address: '',
    comment: `Запрос подбора: ${selection.message || ''} ${selection.partSize ? `Размер: ${selection.partSize}` : ''} ${selection.comment || ''}`,
    source: 'selection_request',
    sourcePage: '/selection',
    meta: {
      applianceModel: selection.applianceModel,
      partSize: selection.partSize,
    },
  };

  const lead = createLeadRecord(leadPayload);
  let telegramResult = 'skipped';
  try {
    await sendOwnerLeadNotification(lead);
    telegramResult = 'sent';
  } catch (error) {
    console.error('[shop.selection.telegram_error]', error);
    telegramResult = 'failed';
  }

  return res.status(201).json({ success: true, selection, leadId: lead.id, telegram: telegramResult });
});

shopRouter.post('/api/shop/analytics', (req, res) => {
  const body = req.body || {};
  if (!body.eventType) {
    return res.status(400).json(formatValidationError('eventType is required')); 
  }

  const event = shopStore.logAnalyticsEvent(body);
  console.info('[shop.analytics]', event);
  return res.status(201).json({ success: true, event });
});

shopRouter.get('/api/admin/shop/products', requireAdminKey, (_req, res) => {
  const items = shopStore.listProducts({ page: 1, limit: 200 }).items;
  res.json({ success: true, items });
});

shopRouter.post('/api/admin/shop/products', requireAdminKey, (req, res) => {
  const product = shopStore.createProduct(req.body || {});
  res.status(201).json({ success: true, product });
});

shopRouter.patch('/api/admin/shop/products/:id', requireAdminKey, (req, res) => {
  const product = shopStore.updateProduct(req.params.id, req.body || {});
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, product });
});

shopRouter.delete('/api/admin/shop/products/:id', requireAdminKey, (req, res) => {
  const removed = shopStore.deleteProduct(req.params.id);
  if (!removed) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true });
});

shopRouter.get('/api/admin/shop/categories', requireAdminKey, (_req, res) => {
  res.json({ success: true, items: shopStore.listCategories() });
});

shopRouter.post('/api/admin/shop/categories', requireAdminKey, (req, res) => {
  const category = shopStore.createCategory(req.body || {});
  res.status(201).json({ success: true, category });
});

shopRouter.patch('/api/admin/shop/categories/:id', requireAdminKey, (req, res) => {
  const category = shopStore.updateCategory(req.params.id, req.body || {});
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }
  res.json({ success: true, category });
});

shopRouter.delete('/api/admin/shop/categories/:id', requireAdminKey, (req, res) => {
  const removed = shopStore.deleteCategory(req.params.id);
  if (!removed) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }
  res.json({ success: true });
});

shopRouter.get('/api/admin/shop/orders', requireAdminKey, (_req, res) => {
  res.json({ success: true, items: shopStore.listOrders() });
});

shopRouter.patch('/api/admin/shop/orders/:id/status', requireAdminKey, (req, res) => {
  const order = shopStore.updateOrderStatus(req.params.id, req.body.status, req.body.meta);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  res.json({ success: true, order });
});

shopRouter.get('/api/admin/shop/orders/:id/commerce', requireAdminKey, async (req, res) => {
  const localOrder = shopStore.getOrderById(req.params.id);
  if (!localOrder) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (!localOrder.vendureOrderId && !localOrder.vendureOrderCode) {
    return res.json({ success: true, localOrder, vendure: { ok: false, reason: 'not_linked' } });
  }
  try {
    const vendure = await fetchVendureOrder({
      id: localOrder.vendureOrderId,
      code: localOrder.vendureOrderCode,
    });
    if (vendure.ok) {
      shopStore.attachVendureOrder(localOrder.id, vendure.order);
    }
    res.json({ success: true, localOrder: shopStore.getOrderById(req.params.id), vendure });
  } catch (error) {
    console.error('[shop.order.commerce_error]', error);
    res.status(500).json({ success: false, message: error.message || 'Commerce order fetch failed' });
  }
});

shopRouter.post('/api/admin/shop/orders/:id/commerce/actions', requireAdminKey, async (req, res) => {
  const localOrder = shopStore.getOrderById(req.params.id);
  if (!localOrder) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  const vendureOrderId = req.body?.vendureOrderId || localOrder.vendureOrderId;
  if (!vendureOrderId) {
    return res.status(409).json({ success: false, message: 'Order is not linked to Vendure' });
  }

  try {
    const result = await applyVendureOrderAction({
      orderId: vendureOrderId,
      action: req.body?.action,
      note: req.body?.note,
      state: req.body?.state,
      paymentMethod: req.body?.paymentMethod,
      transactionId: req.body?.transactionId,
      fulfillmentMethod: req.body?.fulfillmentMethod,
      trackingCode: req.body?.trackingCode,
    });
    if (result.ok && result.order) {
      shopStore.attachVendureOrder(localOrder.id, result.order);
      if (req.body?.localStatus) {
        shopStore.updateOrderStatus(localOrder.id, req.body.localStatus, { vendureAction: req.body.action });
      }
    }
    res.status(result.ok ? 200 : 422).json({
      success: result.ok,
      result,
      localOrder: shopStore.getOrderById(localOrder.id),
    });
  } catch (error) {
    console.error('[shop.order.commerce_action_error]', error);
    res.status(500).json({ success: false, message: error.message || 'Commerce action failed' });
  }
});

shopRouter.get('/api/admin/shop/analytics', requireAdminKey, (_req, res) => {
  res.json({ success: true, items: shopStore.listAnalytics() });
});

shopRouter.post('/api/admin/shop/import', requireAdminKey, async (_req, res) => {
  try {
    const result = await importSeedCatalogToVendure();
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    console.error('[shop.import.error]', error);
    res.status(500).json({ success: false, message: error.message || 'Shop import failed' });
  }
});
