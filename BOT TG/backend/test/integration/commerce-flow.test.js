import assert from 'node:assert/strict';
import { test } from 'node:test';

const backendUrl = (process.env.INTEGRATION_BACKEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const adminKey = process.env.INTEGRATION_ADMIN_KEY || process.env.ADMIN_KEY || 'change_me_admin_key';

const request = async (path, requestOptions = {}) => {
  const { timeoutMs = 30_000, ...options } = requestOptions;
  const response = await fetch(`${backendUrl}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
  return { response, body };
};

test('current commerce flow remains connected to Vendure and OpenSearch', async (t) => {
  let selectedProduct;
  let quote;
  let createdOrder;

  await t.test('catalog returns indexed products', async () => {
    const { body } = await request('/api/shop/products?limit=5');
    assert.equal(body.provider, 'opensearch');
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length > 0);

    selectedProduct = body.items.find((item) => item.inStock && item.slug && item.sku);
    assert.ok(selectedProduct, 'Expected at least one in-stock product with slug and SKU');
    assert.equal(selectedProduct.currency, 'KZT');
  });

  await t.test('search finds the selected catalog product', async () => {
    const query = encodeURIComponent(selectedProduct.sku);
    const { body } = await request(`/api/shop/search?q=${query}&limit=10`);
    assert.equal(body.success, true);
    assert.equal(body.provider, 'opensearch');
    assert.ok(body.items.some((item) => item.sku === selectedProduct.sku));
  });

  await t.test('checkout quote is calculated by Vendure', async () => {
    const { body } = await request('/api/shop/checkout/quote', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ productId: selectedProduct.slug, quantity: 1 }],
      }),
    });

    assert.equal(body.success, true);
    assert.equal(body.quote.ok, true);
    assert.equal(body.quote.source, 'vendure');
    assert.equal(body.quote.currencyCode, 'KZT');
    assert.equal(body.quote.totalQuantity, 1);
    assert.ok(body.quote.totalWithTax > 0);
    assert.equal(body.quote.lines[0].sku, selectedProduct.sku);
    quote = body.quote;
  });

  await t.test('order creation stores Vendure id, code and state', async () => {
    const marker = Date.now();
    const { body } = await request('/api/shop/orders', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: `integration_${marker}`,
        customerName: 'Commerce Integration Test',
        phone: `7700${String(marker).slice(-7)}`,
        city: 'Almaty',
        contactMethod: 'phone',
        deliveryMethod: 'pickup',
        comment: `Automated integration test ${marker}`,
        source: 'integration-test',
        sourcePage: '/integration-test',
        items: [{ productId: selectedProduct.slug, quantity: 1 }],
      }),
    });

    assert.equal(body.success, true);
    assert.ok(body.order.id.startsWith('order_'));
    assert.equal(body.order.totalAmount, quote.totalWithTax);
    assert.ok(body.order.vendureOrderId);
    assert.ok(body.order.vendureOrderCode);
    assert.equal(body.order.vendureOrderState, 'Draft');
    assert.equal(body.order.vendureCurrencyCode, 'KZT');
    assert.equal(body.vendure.ok, true);
    createdOrder = body.order;
  });

  await t.test('local order remains linked to the same Vendure order', async () => {
    const { body } = await request(`/api/admin/shop/orders/${encodeURIComponent(createdOrder.id)}/commerce`, {
      headers: { 'x-admin-key': adminKey },
    });

    assert.equal(body.success, true);
    assert.equal(body.vendure.ok, true);
    assert.equal(String(body.vendure.order.id), String(createdOrder.vendureOrderId));
    assert.equal(body.vendure.order.code, createdOrder.vendureOrderCode);
    assert.equal(body.vendure.order.state, createdOrder.vendureOrderState);
    assert.equal(body.vendure.order.customFields.localOrderId, createdOrder.id);
  });

  await t.test('Vendure products can be synchronized back to OpenSearch', async () => {
    const { response, body } = await request('/api/admin/integrations/vendure/sync-products', {
      method: 'POST',
      timeoutMs: 90_000,
      headers: { 'x-admin-key': adminKey },
    });

    assert.equal(response.status, 202);
    assert.equal(body.success, true);
    assert.equal(body.source, 'vendure');
    assert.ok(body.total > 0);

    const refreshed = await request(`/api/shop/search?q=${encodeURIComponent(selectedProduct.sku)}&limit=10`);
    assert.ok(refreshed.body.items.some((item) => item.sku === selectedProduct.sku));
  });

  t.diagnostic(`Created local order ${createdOrder.id}`);
  t.diagnostic(`Created Vendure order ${createdOrder.vendureOrderCode} (${createdOrder.vendureOrderState})`);
});
