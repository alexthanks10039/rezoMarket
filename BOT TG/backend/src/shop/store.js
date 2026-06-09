import { shopCategories, shopProducts } from './seed-data.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const categories = shopCategories
  .filter((item) => item.isActive)
  .sort((a, b) => a.sortOrder - b.sortOrder);

const products = shopProducts.filter((item) => item.isActive);
const categoryById = new Map(categories.map((item) => [item.id, item]));
const productById = new Map(products.map((item) => [item.id, item]));
const productBySlug = new Map(products.map((item) => [item.slug, item]));
const carts = new Map();
const orders = new Map();
const analyticsEvents = [];
const selectionRequests = [];

const toCategory = (category) => ({
  ...clone(category),
  productsCount: products.filter((product) => product.categoryId === category.id).length,
});

const toProduct = (product) => ({
  ...clone(product),
  category: clone(categoryById.get(product.categoryId) || null),
});

const normalizeSearchText = (value) => {
  const text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[х×*]/g, 'x');
  const compact = text.replace(/[\s._/-]+/g, '');
  const spacedSize = text.match(/\b(\d{2,})\s+(\d{2,})\s+(\d{1,}(?:[.,]\d+)?)\b/);
  const sizeAlias = spacedSize ? `${spacedSize[1]}x${spacedSize[2]}x${spacedSize[3].replace(',', '.')}` : '';

  return [text, compact, sizeAlias].filter(Boolean);
};

const buildCartTotals = (cart) => {
  const items = cart.items || [];
  const totalAmount = items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  return {
    ...cart,
    items,
    totalAmount,
    itemCount: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
  };
};

const ensureCart = (sessionId) => {
  if (!sessionId) {
    return null;
  }

  if (!carts.has(sessionId)) {
    const cart = {
      id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    carts.set(sessionId, cart);
  }

  return carts.get(sessionId);
};

export const listCategories = () => categories.map(toCategory);

export const getCatalogFilters = () => {
  const unique = (mapper) => Array.from(new Set(products
    .flatMap((product) => mapper(product))
    .map((value) => String(value || '').trim())
    .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru'));

  const prices = products
    .map((product) => Number(product.price))
    .filter((price) => !Number.isNaN(price));

  return {
    brands: unique((product) => [product.brand]),
    materials: unique((product) => [product.material]),
    applianceTypes: unique((product) => [product.applianceType]),
    compatibility: unique((product) => product.compatibility || []),
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };
};

export const getCategoryBySlug = (slug) => {
  if (!slug) return null;
  return categories.find((category) => category.slug === slug) || null;
};

export const getCategoryById = (id) => categoryById.get(id) || null;

export const listProducts = ({
  search,
  category,
  brand,
  size,
  applianceType,
  material,
  compatibility,
  minPrice,
  maxPrice,
  inStock,
  hasDiscount,
  sort,
  page = 1,
  limit = 12,
}) => {
  let items = products.slice();

  if (category) {
    const categoryRecord = categories.find((item) => item.slug === category);
    if (categoryRecord) {
      items = items.filter((product) => product.categoryId === categoryRecord.id);
    }
  }

  if (search) {
    const needles = normalizeSearchText(search);
    items = items.filter((product) => {
      const haystack = normalizeSearchText([
        product.title,
        product.sku,
        product.brand,
        product.size,
        product.applianceType,
        product.material,
        product.description,
        ...(product.tags || []),
        ...(product.compatibility || []),
      ].join(' '));

      return needles.some((needle) => haystack.some((value) => value.includes(needle)));
    });
  }

  if (brand) {
    const value = String(brand).trim().toLowerCase();
    items = items.filter((product) => String(product.brand || '').toLowerCase().includes(value));
  }

  if (size) {
    const value = String(size).trim().toLowerCase();
    items = items.filter((product) => String(product.size || '').toLowerCase().includes(value));
  }

  if (applianceType) {
    const value = String(applianceType).trim().toLowerCase();
    items = items.filter((product) => String(product.applianceType || '').toLowerCase().includes(value));
  }

  if (material) {
    const value = String(material).trim().toLowerCase();
    items = items.filter((product) => String(product.material || '').toLowerCase().includes(value));
  }

  if (compatibility) {
    const value = String(compatibility).trim().toLowerCase();
    items = items.filter((product) => [
      ...(product.compatibility || []),
      ...(product.tags || []),
      product.description,
    ].some((field) => String(field || '').toLowerCase().includes(value)));
  }

  if (typeof inStock !== 'undefined' && inStock !== null) {
    const value = String(inStock).toLowerCase();
    if (value === 'true') {
      items = items.filter((product) => product.inStock === true);
    } else if (value === 'false') {
      items = items.filter((product) => product.inStock === false);
    }
  }

  if (String(hasDiscount).toLowerCase() === 'true') {
    items = items.filter((product) => Number(product.oldPrice || 0) > Number(product.price || 0));
  }

  if (minPrice != null) {
    const value = Number(minPrice);
    if (!Number.isNaN(value)) {
      items = items.filter((product) => Number(product.price) >= value);
    }
  }

  if (maxPrice != null) {
    const value = Number(maxPrice);
    if (!Number.isNaN(value)) {
      items = items.filter((product) => Number(product.price) <= value);
    }
  }

  if (sort) {
    switch (sort) {
      case 'price_asc':
        items.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        items.sort((a, b) => b.price - a.price);
        break;
      case 'newest':
        items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      case 'in_stock':
        items.sort((a, b) => Number(b.inStock) - Number(a.inStock));
        break;
      case 'stock_desc':
        items.sort((a, b) => Number(b.stockQty || 0) - Number(a.stockQty || 0));
        break;
      case 'discount':
        items.sort((a, b) => Number(b.oldPrice || 0) - Number(b.price || 0) - (Number(a.oldPrice || 0) - Number(a.price || 0)));
        break;
      default:
        items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        break;
    }
  }

  const total = items.length;
  const pageNumber = Math.max(1, Number(page) || 1);
  const pageLimit = Math.max(1, Number(limit) || 12);
  const paged = items.slice((pageNumber - 1) * pageLimit, pageNumber * pageLimit);

  return {
    items: paged.map(toProduct),
    total,
    page: pageNumber,
    limit: pageLimit,
  };
};

export const getProductBySlug = (slug) => {
  if (!slug) return null;
  const product = products.find((item) => item.slug === slug);
  return product ? toProduct(product) : null;
};

export const getProductById = (productId) => {
  if (!productId) return null;
  const product = products.find((item) => item.id === productId || item.slug === productId || item.sku === productId);
  return product ? clone(product) : null;
};

export const findProductsBySlugs = (slugs = []) => {
  return slugs
    .map((slug) => getProductBySlug(slug))
    .filter(Boolean);
};

export const getOrCreateCart = (sessionId) => {
  if (!sessionId) {
    return null;
  }

  let cart = ensureCart(sessionId);
  return buildCartTotals(cart);
};

export const addCartItem = (sessionId, productId, quantity) => {
  if (!sessionId || !productId) return null;
  const product = getProductById(productId);
  if (!product) return null;

  const cart = ensureCart(sessionId);
  const quantityValue = Math.max(1, Number(quantity) || 1);
  const existing = cart.items.find((item) => item.productId === productId);

  if (existing) {
    existing.quantity = Math.min(50, existing.quantity + quantityValue);
    existing.subtotal = existing.quantity * existing.price;
  } else {
    cart.items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      productId,
      slug: product.slug,
      title: product.title,
      sku: product.sku,
      price: product.price,
      quantity: quantityValue,
      image: product.images?.[0] || '',
      inStock: product.inStock,
      subtotal: product.price * quantityValue,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  cart.updatedAt = new Date().toISOString();
  return buildCartTotals(cart);
};

export const updateCartItem = (sessionId, itemId, quantity) => {
  if (!sessionId || !itemId) return null;
  const cart = ensureCart(sessionId);
  const item = cart.items.find((record) => record.id === itemId);
  if (!item) return null;

  const quantityValue = Number(quantity);
  if (Number.isNaN(quantityValue) || quantityValue < 1) {
    return null;
  }

  item.quantity = Math.min(50, quantityValue);
  item.subtotal = item.quantity * item.price;
  item.updatedAt = new Date().toISOString();
  cart.updatedAt = new Date().toISOString();

  return buildCartTotals(cart);
};

export const removeCartItem = (sessionId, itemId) => {
  if (!sessionId || !itemId) return null;
  const cart = ensureCart(sessionId);
  cart.items = cart.items.filter((item) => item.id !== itemId);
  cart.updatedAt = new Date().toISOString();
  return buildCartTotals(cart);
};

export const clearCart = (sessionId) => {
  if (!sessionId) return null;
  const cart = ensureCart(sessionId);
  cart.items = [];
  cart.updatedAt = new Date().toISOString();
  return buildCartTotals(cart);
};

export const createOrder = ({
  sessionId,
  customerName,
  phone,
  city,
  contactMethod,
  deliveryMethod,
  comment,
  items,
  totalAmount,
  source,
}) => {
  const now = new Date().toISOString();
  const orderItems = (items || []).map((item) => ({
    id: `order_item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    productId: item.productId,
    title: item.title,
    sku: item.sku,
    price: item.price,
    quantity: item.quantity,
    total: item.price * item.quantity,
    createdAt: now,
  }));

  const order = {
    id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: sessionId || null,
    status: 'new',
    vendureOrderId: null,
    vendureOrderCode: null,
    vendureOrderState: null,
    vendureCurrencyCode: null,
    vendureTotalWithTax: null,
    customerName: String(customerName || '').trim(),
    phone: String(phone || '').trim(),
    city: String(city || '').trim(),
    contactMethod: contactMethod || 'phone',
    deliveryMethod: deliveryMethod || 'manager',
    comment: String(comment || '').trim(),
    items: orderItems,
    totalAmount: Number(totalAmount) || orderItems.reduce((sum, item) => sum + item.total, 0),
    source: source || 'shop',
    meta: {
      cartItems: orderItems.length,
      createdAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  orders.set(order.id, order);
  return clone(order);
};

export const getOrderById = (orderId) => {
  if (!orderId) return null;
  return clone(orders.get(orderId) || null);
};

export const listOrders = () => [...orders.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

export const updateOrderStatus = (orderId, status, meta = {}) => {
  const order = orders.get(orderId);
  if (!order) return null;
  order.status = String(status || order.status).trim() || order.status;
  order.meta = {
    ...(order.meta || {}),
    ...(meta || {}),
  };
  order.updatedAt = new Date().toISOString();
  return clone(order);
};

export const attachVendureOrder = (orderId, vendureOrder) => {
  const order = orders.get(orderId);
  if (!order || !vendureOrder) return null;
  order.vendureOrderId = vendureOrder.id || order.vendureOrderId;
  order.vendureOrderCode = vendureOrder.code || order.vendureOrderCode;
  order.vendureOrderState = vendureOrder.state || order.vendureOrderState;
  order.vendureCurrencyCode = vendureOrder.currencyCode || order.vendureCurrencyCode;
  order.vendureTotalWithTax = Number(vendureOrder.totalWithTax ?? order.vendureTotalWithTax ?? order.totalAmount);
  order.meta = {
    ...(order.meta || {}),
    vendureOrderId: order.vendureOrderId,
    vendureOrderCode: order.vendureOrderCode,
    vendureOrderState: order.vendureOrderState,
  };
  order.updatedAt = new Date().toISOString();
  return clone(order);
};

export const createSelectionRequest = ({ name, phone, message, applianceModel, partSize, comment, source }) => {
  const now = new Date().toISOString();
  const request = {
    id: `selection_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clientId: null,
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
    message: String(message || '').trim(),
    applianceModel: String(applianceModel || '').trim(),
    partSize: String(partSize || '').trim(),
    vendureProductId: null,
    status: 'new',
    comment: String(comment || '').trim(),
    source: source || 'selection_request',
    meta: null,
    createdAt: now,
    updatedAt: now,
  };

  selectionRequests.push(request);
  return clone(request);
};

export const listSelectionRequests = () => selectionRequests
  .slice()
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  .map(clone);

export const getSelectionRequestById = (requestId) => {
  if (!requestId) return null;
  const request = selectionRequests.find((item) => item.id === requestId);
  return request ? clone(request) : null;
};

export const updateSelectionRequestStatus = (requestId, status) => {
  const request = selectionRequests.find((item) => item.id === requestId);
  if (!request) return null;
  request.status = String(status || request.status).trim() || request.status;
  request.updatedAt = new Date().toISOString();
  return clone(request);
};

export const logAnalyticsEvent = (event) => {
  const record = {
    id: `analytics_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: String(event.eventType || 'unknown'),
    productId: event.productId || null,
    vendureProductId: event.vendureProductId || event.productId || null,
    vendureVariantId: event.vendureVariantId || null,
    categoryId: event.categoryId || null,
    orderId: event.orderId || null,
    vendureOrderId: event.vendureOrderId || event.orderId || null,
    searchQuery: event.searchQuery || event.query || null,
    clientId: event.clientId || null,
    sessionId: event.sessionId || null,
    source: event.source || 'shop',
    value: event.value || null,
    meta: event.meta || null,
    timestamp: new Date().toISOString(),
  };

  analyticsEvents.push(record);
  return clone(record);
};

export const listAnalytics = () => analyticsEvents.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

const getSecret = (value) => String(value || '').trim();

export const isAdminKeyValid = (key) => {
  const configured = getSecret(process.env.ADMIN_KEY);
  if (!configured) {
    return false;
  }
  return getSecret(key) === configured;
};

export const createCategory = (payload) => {
  const category = {
    id: `category_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    description: String(payload.description || '').trim(),
    image: String(payload.image || ''),
    sortOrder: Number(payload.sortOrder) || 99,
    isActive: payload.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  categories.push(category);
  categoryById.set(category.id, category);
  return clone(category);
};

export const updateCategory = (categoryId, payload) => {
  const category = categoryById.get(categoryId);
  if (!category) return null;
  category.title = String(payload.title || category.title).trim();
  category.slug = String(payload.slug || category.slug).trim();
  category.description = String(payload.description || category.description).trim();
  category.image = String(payload.image || category.image);
  category.sortOrder = Number(payload.sortOrder) || category.sortOrder;
  category.isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : category.isActive;
  category.updatedAt = new Date().toISOString();
  return clone(category);
};

export const deleteCategory = (categoryId) => {
  const category = categoryById.get(categoryId);
  if (!category) return false;
  const index = categories.findIndex((item) => item.id === categoryId);
  if (index >= 0) {
    categories.splice(index, 1);
  }
  categoryById.delete(categoryId);
  return true;
};

export const createProduct = (payload) => {
  const product = {
    id: `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    categoryId: String(payload.categoryId || '').trim(),
    title: String(payload.title || '').trim(),
    slug: String(payload.slug || '').trim(),
    sku: String(payload.sku || '').trim(),
    price: Number(payload.price) || 0,
    oldPrice: payload.oldPrice ? Number(payload.oldPrice) : null,
    currency: String(payload.currency || 'KZT'),
    inStock: payload.inStock !== false,
    stockQty: Number(payload.stockQty) || 0,
    brand: String(payload.brand || '').trim(),
    size: String(payload.size || '').trim(),
    applianceType: String(payload.applianceType || '').trim(),
    material: String(payload.material || '').trim(),
    description: String(payload.description || '').trim(),
    specs: payload.specs || {},
    compatibility: payload.compatibility || [],
    tags: payload.tags || [],
    images: payload.images || [],
    isActive: payload.isActive !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  products.push(product);
  productById.set(product.id, product);
  productBySlug.set(product.slug, product);
  return toProduct(product);
};

export const updateProduct = (productId, payload) => {
  const product = productById.get(productId);
  if (!product) return null;
  product.categoryId = String(payload.categoryId || product.categoryId).trim();
  product.title = String(payload.title || product.title).trim();
  product.slug = String(payload.slug || product.slug).trim();
  product.sku = String(payload.sku || product.sku).trim();
  product.price = Number(payload.price) || product.price;
  product.oldPrice = payload.oldPrice != null ? Number(payload.oldPrice) : product.oldPrice;
  product.currency = String(payload.currency || product.currency);
  product.inStock = payload.inStock !== undefined ? Boolean(payload.inStock) : product.inStock;
  product.stockQty = Number(payload.stockQty || product.stockQty);
  product.brand = String(payload.brand || product.brand).trim();
  product.size = String(payload.size || product.size).trim();
  product.applianceType = String(payload.applianceType || product.applianceType).trim();
  product.material = String(payload.material || product.material).trim();
  product.description = String(payload.description || product.description).trim();
  product.specs = payload.specs || product.specs;
  product.compatibility = payload.compatibility || product.compatibility;
  product.tags = payload.tags || product.tags;
  product.images = payload.images || product.images;
  product.isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : product.isActive;
  product.updatedAt = new Date().toISOString();
  productBySlug.set(product.slug, product);
  return toProduct(product);
};

export const deleteProduct = (productId) => {
  const product = productById.get(productId);
  if (!product) return false;
  const index = products.findIndex((item) => item.id === productId);
  if (index >= 0) {
    products.splice(index, 1);
  }
  productById.delete(productId);
  productBySlug.delete(product.slug);
  return true;
};
