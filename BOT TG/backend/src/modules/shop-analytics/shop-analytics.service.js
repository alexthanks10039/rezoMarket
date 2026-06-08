import * as shopStore from '../../shop/store.js';

const sum = (items, mapper) => items.reduce((total, item) => total + Number(mapper(item) || 0), 0);

const countBy = (items, mapper) => {
  const map = new Map();
  for (const item of items) {
    const key = mapper(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
};

export const createAnalyticsEvent = (payload) => shopStore.logAnalyticsEvent(payload);

export const getAnalyticsSummary = () => {
  const events = shopStore.listAnalytics();
  const orders = shopStore.listOrders();
  const revenue = sum(orders, (order) => order.totalAmount);
  const productViews = events.filter((event) => event.eventType === 'product_view');
  const addToCart = events.filter((event) => event.eventType === 'add_to_cart');
  const orderCreated = events.filter((event) => ['order_created', 'vendure_order_created'].includes(event.eventType));
  const searches = events.filter((event) => event.eventType === 'search_used');
  const searchesWithoutResult = searches.filter((event) => Number(event.meta?.total || event.meta?.results || 0) === 0);

  return {
    revenue,
    orders: orders.length,
    averageOrderValue: orders.length ? Math.round(revenue / orders.length) : 0,
    events: events.length,
    searches: searches.length,
    searchesWithoutResult: searchesWithoutResult.length,
    productViewToCartConversion: productViews.length ? Number((addToCart.length / productViews.length).toFixed(3)) : 0,
    cartToOrderConversion: addToCart.length ? Number((orderCreated.length / addToCart.length).toFixed(3)) : 0,
    popularProducts: countBy(events.filter((event) => ['product_view', 'add_to_cart'].includes(event.eventType)), (event) => (
      event.vendureProductId || event.productId || event.meta?.productSlug
    )).slice(0, 10),
    topSearches: countBy(searches, (event) => event.searchQuery || event.meta?.query).slice(0, 10),
  };
};

export const getSearchAnalytics = () => {
  const searches = shopStore.listAnalytics().filter((event) => event.eventType === 'search_used');
  return {
    items: searches,
    topQueries: countBy(searches, (event) => event.searchQuery || event.meta?.query).slice(0, 30),
    withoutResults: searches.filter((event) => Number(event.meta?.total || event.meta?.results || 0) === 0),
  };
};

export const getProductAnalytics = () => {
  const events = shopStore.listAnalytics().filter((event) => event.productId || event.vendureProductId);
  return {
    items: events,
    products: countBy(events, (event) => event.vendureProductId || event.productId).slice(0, 30),
  };
};

