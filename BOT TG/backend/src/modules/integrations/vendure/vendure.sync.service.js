import * as shopStore from '../../../shop/store.js';
import { createAnalyticsEvent } from '../../shop-analytics/shop-analytics.service.js';
import { indexProductFromVendure, rebuildCatalogIndex, toCatalogDocument } from '../../search/opensearch.service.js';
import { fetchVendureOrders, fetchVendureProducts, isVendureConfigured } from './vendure.client.js';

const syncLogs = [];
const productKnowledgeSnapshots = new Map();

export const logVendureSync = ({
  eventType,
  entityType,
  vendureEntityId,
  status = 'success',
  payload = null,
  errorMessage = null,
}) => {
  const record = {
    id: `vendure_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType,
    entityType,
    vendureEntityId: vendureEntityId ? String(vendureEntityId) : null,
    status,
    payload,
    errorMessage,
    createdAt: new Date().toISOString(),
  };
  syncLogs.unshift(record);
  syncLogs.splice(500);
  return { ...record };
};

export const listVendureSyncLogs = () => syncLogs.slice();

export const upsertProductKnowledgeSnapshot = (product) => {
  const document = toCatalogDocument(product);
  const snapshot = {
    id: `snapshot_${document.variantId || document.productId || document.slug}`,
    vendureProductId: document.productId,
    vendureVariantId: document.variantId,
    sku: document.sku,
    slug: document.slug,
    title: document.title,
    description: document.description,
    specs: {
      size: document.size,
      brand: document.brand,
      material: document.material,
      applianceType: document.applianceType,
      innerDiameter: document.innerDiameter,
      outerDiameter: document.outerDiameter,
      width: document.width,
    },
    compatibility: document.compatibility,
    contentForEmbedding: [
      document.title,
      document.description,
      document.sku,
      document.size,
      document.brand,
      document.material,
      document.applianceType,
      Array.isArray(document.compatibility) ? document.compatibility.join(', ') : document.compatibility,
      document.searchKeywords,
    ].filter(Boolean).join('\n'),
    lastSyncedAt: new Date().toISOString(),
    isActive: true,
  };
  productKnowledgeSnapshots.set(snapshot.id, snapshot);
  return { ...snapshot };
};

export const listProductKnowledgeSnapshots = () => Array.from(productKnowledgeSnapshots.values());

const getFallbackProducts = () => shopStore.listProducts({ page: 1, limit: 1000 }).items;

export const syncProductsFromVendure = async () => {
  const products = [];
  if (isVendureConfigured()) {
    let skip = 0;
    const take = 100;
    let total = 0;
    do {
      const response = await fetchVendureProducts({ take, skip });
      total = response.totalItems;
      products.push(...response.items);
      skip += take;
    } while (skip < total);
  } else {
    products.push(...getFallbackProducts());
  }

  const results = [];
  for (const product of products) {
    upsertProductKnowledgeSnapshot(product);
    results.push(await indexProductFromVendure(product));
  }

  logVendureSync({
    eventType: 'manual.product.sync',
    entityType: 'product',
    status: 'success',
    payload: {
      source: isVendureConfigured() ? 'vendure' : 'fallback',
      total: products.length,
      indexed: results.filter((item) => item.ok).length,
    },
  });

  return {
    source: isVendureConfigured() ? 'vendure' : 'fallback',
    total: products.length,
    indexed: results.filter((item) => item.ok).length,
    skipped: results.filter((item) => item.skipped).length,
  };
};

export const syncOrdersFromVendure = async () => {
  if (!isVendureConfigured()) {
    const fallbackOrders = shopStore.listOrders();
    return {
      source: 'fallback',
      total: fallbackOrders.length,
      warning: 'Vendure Admin API is not configured; returned local shop orders.',
    };
  }

  const response = await fetchVendureOrders({ take: 50, skip: 0 });
  for (const order of response.items) {
    createAnalyticsEvent({
      eventType: 'vendure_order_created',
      vendureOrderId: order.id,
      value: order.totalWithTax,
      source: 'vendure_sync',
      meta: { code: order.code, state: order.state, currency: order.currencyCode },
    });
  }
  logVendureSync({
    eventType: 'manual.order.sync',
    entityType: 'order',
    status: 'success',
    payload: { total: response.items.length },
  });
  return { source: 'vendure', total: response.items.length };
};

export const rebuildShopRag = async () => {
  const syncResult = await syncProductsFromVendure();
  logVendureSync({
    eventType: 'rag_rebuild_completed',
    entityType: 'product_knowledge_snapshot',
    status: 'success',
    payload: { snapshots: productKnowledgeSnapshots.size },
  });
  return {
    ...syncResult,
    snapshots: productKnowledgeSnapshots.size,
  };
};

export const rebuildSearchFromFallback = async () => rebuildCatalogIndex(getFallbackProducts());

