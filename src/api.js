const metaApiBase = document.querySelector('meta[name="api-base"]')?.content?.trim();
const API_BASE = metaApiBase || (window.location.protocol.startsWith('http') ? `${window.location.protocol}//${window.location.hostname}:3000` : 'http://127.0.0.1:3000');

const defaultHeaders = {
  'Content-Type': 'application/json',
};

const request = async (path, options = {}) => {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { ...defaultHeaders, ...(options.headers || {}) },
    ...options,
  });

  const bodyText = await response.text();
  let parsed = null;

  try {
    parsed = JSON.parse(bodyText || '{}');
  } catch (error) {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.message || response.statusText || 'Unknown error';
    throw new Error(message);
  }

  return parsed;
};

const queryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    query.set(key, String(value));
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
};

export const getApiBase = () => API_BASE;

export const fetchCategories = () => request('/api/shop/categories');
export const fetchFilterOptions = () => request('/api/shop/filters');
export const fetchCategory = (slug) => request(`/api/shop/categories/${encodeURIComponent(slug)}`);
export const fetchProducts = (filters = {}) => {
  const query = queryString(filters);
  return request(`/api/shop/products${query}`);
};
export const fetchProduct = (slug) => request(`/api/shop/products/${encodeURIComponent(slug)}`);

export const createCartSession = (sessionId) => request('/api/shop/cart', {
  method: 'POST',
  body: JSON.stringify({ sessionId }),
});

export const fetchCartSession = (sessionId) => request(`/api/shop/cart/${encodeURIComponent(sessionId)}`);

export const addCartItem = (sessionId, productId, quantity = 1) =>
  request('/api/shop/cart/items', {
    method: 'POST',
    body: JSON.stringify({ sessionId, productId, quantity }),
  });

export const updateCartItem = (sessionId, itemId, quantity) =>
  request(`/api/shop/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sessionId, quantity }),
  });

export const deleteCartItem = (sessionId, itemId) =>
  request(`/api/shop/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ sessionId }),
  });

export const submitOrder = (payload) =>
  request('/api/shop/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const submitSelectionRequest = (payload) =>
  request('/api/shop/selection-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const sendAnalyticsEvent = (payload) =>
  request('/api/shop/analytics', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const askShopAssistant = (question) =>
  request('/api/rag/ask', {
    method: 'POST',
    body: JSON.stringify({ question, context: 'shop' }),
  });
