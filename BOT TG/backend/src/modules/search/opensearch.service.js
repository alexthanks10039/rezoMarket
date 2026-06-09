import * as shopStore from '../../shop/store.js';
import { isOpenSearchConfigured, opensearchRequest } from './opensearch.client.js';

const INDEX_NAME = process.env.OPENSEARCH_CATALOG_INDEX || 'catalog_products';

const normalizeSize = (value) => String(value || '').trim().toLowerCase().replace(/[х×*]/g, 'x');

const parseSize = (value) => {
  const normalized = normalizeSize(value);
  const match = normalized.match(/(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)/);
  if (!match) {
    return {};
  }
  return {
    innerDiameter: Number(match[1].replace(',', '.')),
    outerDiameter: Number(match[2].replace(',', '.')),
    width: Number(match[3].replace(',', '.')),
  };
};

export const toCatalogDocument = (product) => {
  const variant = product.variants?.[0] || product.variant || {};
  const stockQty = Number(product.stockQty ?? variant.stockOnHand ?? product.stockOnHand ?? 0);
  const inStock = product.inStock ?? (variant.stockLevel ? variant.stockLevel !== 'OUT_OF_STOCK' : stockQty > 0);
  const categoryFacet = (product.facetValues || []).find((value) => (
    value.facet?.code === 'shop-category' || value.facet?.code === 'category' || value.facet?.name === 'Категория магазина'
  ));
  const category = product.category || product.collections?.[0] || categoryFacet || {};
  const customFields = {
    ...(product.customFields || {}),
    ...(variant.customFields || {}),
  };
  const parsedSize = parseSize(customFields.size || product.size || variant.size);

  return {
    id: product.slug || product.id || product.productId || '',
    productId: String(product.id || product.productId || ''),
    variantId: String(variant.id || product.variantId || product.id || ''),
    slug: product.slug,
    title: product.title || product.name || variant.name || product.slug,
    description: product.description || '',
    sku: variant.sku || product.sku || customFields.externalSku || '',
    category: category.title || category.name || category.slug || product.category || '',
    categorySlug: category.slug || category.code || product.categoryId || '',
    collection: category.name || category.title || product.collection || '',
    price: Number(product.price ?? variant.price ?? 0),
    currency: product.currency || variant.currencyCode || 'KZT',
    inStock,
    stockQty,
    brand: customFields.brand || product.brand || '',
    size: normalizeSize(customFields.size || product.size || ''),
    innerDiameter: Number(customFields.innerDiameter ?? product.innerDiameter ?? parsedSize.innerDiameter ?? 0) || null,
    outerDiameter: Number(customFields.outerDiameter ?? product.outerDiameter ?? parsedSize.outerDiameter ?? 0) || null,
    width: Number(customFields.width ?? product.width ?? parsedSize.width ?? 0) || null,
    material: customFields.material || product.material || '',
    applianceType: customFields.applianceType || product.applianceType || '',
    applianceBrand: customFields.applianceBrand || product.applianceBrand || '',
    applianceModel: customFields.applianceModel || product.applianceModel || '',
    compatibility: product.compatibility || customFields.compatibility || [],
    analogs: product.analogs || customFields.analogs || [],
    tags: product.tags || [],
    searchKeywords: customFields.searchKeywords || product.searchKeywords || '',
    popularityScore: Number(customFields.popularityScore || product.popularityScore || 0),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || new Date().toISOString(),
  };
};

export const ensureCatalogIndex = async () => {
  if (!isOpenSearchConfigured()) {
    return { ok: false, skipped: true, reason: 'OPENSEARCH_NODE is not configured' };
  }

  await opensearchRequest(`/${INDEX_NAME}`, {
    method: 'PUT',
    body: JSON.stringify({
      settings: {
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            catalog_text: {
              type: 'custom',
              tokenizer: 'standard',
              filter: ['lowercase', 'asciifolding'],
            },
          },
        },
      },
      mappings: {
        properties: {
          productId: { type: 'keyword' },
          id: { type: 'keyword' },
          variantId: { type: 'keyword' },
          slug: { type: 'keyword' },
          title: { type: 'text', analyzer: 'catalog_text', fields: { keyword: { type: 'keyword' } } },
          description: { type: 'text', analyzer: 'catalog_text' },
          sku: { type: 'keyword', fields: { text: { type: 'text', analyzer: 'catalog_text' } } },
          category: { type: 'keyword' },
          categorySlug: { type: 'keyword' },
          collection: { type: 'keyword' },
          price: { type: 'float' },
          currency: { type: 'keyword' },
          inStock: { type: 'boolean' },
          stockQty: { type: 'integer' },
          brand: { type: 'keyword' },
          size: { type: 'keyword' },
          innerDiameter: { type: 'float' },
          outerDiameter: { type: 'float' },
          width: { type: 'float' },
          material: { type: 'keyword' },
          applianceType: { type: 'keyword' },
          applianceBrand: { type: 'keyword' },
          applianceModel: { type: 'text', analyzer: 'catalog_text' },
          compatibility: { type: 'text', analyzer: 'catalog_text' },
          analogs: { type: 'keyword' },
          tags: { type: 'keyword' },
          searchKeywords: { type: 'text', analyzer: 'catalog_text' },
          popularityScore: { type: 'float' },
          createdAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    }),
  }).catch((error) => {
    const message = String(error.message);
    if (!message.includes('resource_already_exists_exception') && !message.includes('already exists')) {
      throw error;
    }
  });

  return { ok: true, index: INDEX_NAME };
};

export const resetCatalogIndex = async () => {
  if (!isOpenSearchConfigured()) {
    return { ok: false, skipped: true, reason: 'OPENSEARCH_NODE is not configured' };
  }

  await opensearchRequest(`/${INDEX_NAME}`, { method: 'DELETE' }).catch((error) => {
    const message = String(error.message);
    if (!message.includes('OpenSearch 404')) {
      throw error;
    }
  });

  return ensureCatalogIndex();
};

export const indexProductFromVendure = async (product) => {
  const hasVariant = Boolean(product.variant || product.variants?.length);
  const document = toCatalogDocument(product);
  if (!isOpenSearchConfigured()) {
    return { ok: false, skipped: true, provider: 'fallback', document };
  }
  if (!hasVariant) {
    return { ok: false, skipped: true, reason: 'Product has no indexable variant', document };
  }

  await ensureCatalogIndex();
  const id = document.variantId || document.productId || document.slug;
  await opensearchRequest(`/${INDEX_NAME}/_doc/${encodeURIComponent(id)}?refresh=true`, {
    method: 'PUT',
    body: JSON.stringify(document),
  });
  return { ok: true, index: INDEX_NAME, id, document };
};

export const removeProductFromIndex = async (id) => {
  if (!isOpenSearchConfigured()) {
    return { ok: false, skipped: true, provider: 'fallback' };
  }
  await opensearchRequest(`/${INDEX_NAME}/_doc/${encodeURIComponent(id)}?refresh=true`, { method: 'DELETE' });
  return { ok: true, index: INDEX_NAME, id };
};

const fallbackSearch = (params = {}) => {
  const response = shopStore.listProducts({
    search: params.q || params.search,
    category: params.category,
    brand: params.brand,
    size: params.size,
    applianceType: params.applianceType,
    material: params.material,
    compatibility: params.compatibility,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    inStock: params.inStock,
    sort: params.sort,
    page: Number(params.page) || 1,
    limit: Number(params.limit) || 12,
  });

  return {
    ...response,
    provider: 'fallback',
    warning: isOpenSearchConfigured() ? 'OpenSearch search failed, used local catalog fallback.' : 'OpenSearch is not configured, used local catalog fallback.',
  };
};

export const searchCatalog = async (params = {}) => {
  if (!isOpenSearchConfigured()) {
    return fallbackSearch(params);
  }

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.max(1, Number(params.limit) || 12);
  const filters = [];
  const filterFields = ['category', 'brand', 'size', 'material', 'applianceType', 'inStock'];
  for (const field of filterFields) {
    if (params[field] != null && params[field] !== '') {
      if (field === 'category') {
        filters.push({
          bool: {
            should: [
              { term: { category: params[field] } },
              { term: { categorySlug: params[field] } },
            ],
            minimum_should_match: 1,
          },
        });
      } else {
        filters.push({ term: { [field]: field === 'inStock' ? String(params[field]) === 'true' : params[field] } });
      }
    }
  }
  if (params.slug) {
    filters.push({ term: { slug: params.slug } });
  }
  if (params.minPrice || params.maxPrice) {
    filters.push({
      range: {
        price: {
          ...(params.minPrice ? { gte: Number(params.minPrice) } : {}),
          ...(params.maxPrice ? { lte: Number(params.maxPrice) } : {}),
        },
      },
    });
  }

  const queryText = String(params.q || params.search || '').trim();
  const query = queryText
    ? {
        bool: {
          must: [{
            multi_match: {
              query: queryText,
              fields: ['title^4', 'sku^5', 'size^4', 'searchKeywords^3', 'description', 'compatibility', 'applianceModel^2'],
              fuzziness: 'AUTO',
            },
          }],
          filter: filters,
        },
      }
    : filters.length
      ? { bool: { filter: filters } }
      : { match_all: {} };

  try {
    const payload = await opensearchRequest(`/${INDEX_NAME}/_search`, {
      method: 'POST',
      body: JSON.stringify({
        from: (page - 1) * limit,
        size: limit,
        query,
        sort: params.sort === 'price_asc'
          ? [{ price: 'asc' }]
          : params.sort === 'price_desc'
            ? [{ price: 'desc' }]
            : [{ inStock: 'desc' }, { popularityScore: 'desc' }, { updatedAt: 'desc' }],
        aggs: {
          brands: { terms: { field: 'brand', size: 30 } },
          categories: { terms: { field: 'category', size: 30 } },
          materials: { terms: { field: 'material', size: 30 } },
          applianceTypes: { terms: { field: 'applianceType', size: 30 } },
        },
      }),
    });

    return {
      items: payload.hits.hits.map((hit) => ({ ...hit._source, score: hit._score })),
      total: payload.hits.total?.value ?? payload.hits.hits.length,
      page,
      limit,
      facets: payload.aggregations || {},
      provider: 'opensearch',
    };
  } catch (error) {
    console.error('[opensearch.search.error]', error.message);
    return fallbackSearch(params);
  }
};

export const rebuildCatalogIndex = async (sourceProducts) => {
  const products = sourceProducts || shopStore.listProducts({ page: 1, limit: 1000 }).items;
  if (isOpenSearchConfigured()) {
    await resetCatalogIndex();
  }

  const results = [];
  for (const product of products) {
    results.push(await indexProductFromVendure(product));
  }
  return {
    ok: true,
    total: products.length,
    indexed: results.filter((item) => item.ok).length,
    skipped: results.filter((item) => item.skipped).length,
    provider: isOpenSearchConfigured() ? 'opensearch' : 'fallback',
  };
};
