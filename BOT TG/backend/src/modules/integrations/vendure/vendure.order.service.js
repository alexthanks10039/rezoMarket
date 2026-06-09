import { fetchVendureProducts, isVendureAdminConfigured, vendureAdminRequest } from './vendure.client.js';

const ORDER_FIELDS = `
  id
  code
  state
  active
  totalQuantity
  subTotalWithTax
  shippingWithTax
  totalWithTax
  currencyCode
  customer { id firstName lastName phoneNumber emailAddress }
  shippingAddress { fullName streetLine1 city countryCode phoneNumber }
  shippingLines { shippingMethod { id code name } priceWithTax }
  payments { id method state amount transactionId }
  fulfillments { id state method trackingCode }
  customFields {
    localOrderId
    source
    contactMethod
    deliveryMethod
    managerStatus
    customerComment
  }
  lines {
    id
    quantity
    productVariant { id sku name product { id slug name } }
    unitPriceWithTax
    linePriceWithTax
  }
`;

const normalizePhone = (value) => String(value || '').replace(/[^\d+]/g, '');

const emailFromPhone = (phone) => {
  const normalized = normalizePhone(phone).replace(/[^\d]/g, '') || `${Date.now()}`;
  return `client-${normalized}@mir-salnikov.local`;
};

const splitName = (value) => {
  const parts = String(value || 'Клиент').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || 'Клиент',
    lastName: parts.join(' ') || '-',
  };
};

const findVariantForItem = (products, item) => {
  const product = products.find((record) => (
    record.slug === item.slug ||
    record.slug === item.productId ||
    record.id === item.productId ||
    (record.variants || []).some((variant) => variant.sku === item.sku)
  ));
  if (!product) return null;
  return (product.variants || []).find((variant) => variant.sku === item.sku) || product.variants?.[0] || null;
};

const findProductForItem = (products, item) => products.find((record) => (
  record.slug === item.slug ||
  record.slug === item.productId ||
  record.id === item.productId ||
  record.customFields?.externalSku === item.sku ||
  (record.variants || []).some((variant) => variant.id === item.variantId || variant.sku === item.sku)
));

const normalizeOrderLine = ({ item, product, variant }) => {
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const stockQty = Number(variant.stockOnHand ?? 0);
  const stockLevel = variant.stockLevel || (stockQty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK');
  const inStock = stockLevel !== 'OUT_OF_STOCK' && (stockQty <= 0 || stockQty >= quantity);
  const price = Number(variant.price ?? item.price ?? 0);
  return {
    productId: product.id,
    productSlug: product.slug,
    productName: product.name,
    variantId: variant.id,
    sku: variant.sku,
    title: variant.name || product.name || item.title,
    requestedQuantity: quantity,
    quantity,
    unitPrice: price,
    lineTotal: price * quantity,
    currencyCode: variant.currencyCode || 'KZT',
    stockLevel,
    stockQty,
    inStock,
  };
};

const getShippingMethodId = async () => {
  const data = await vendureAdminRequest(`
    query ShippingMethods {
      shippingMethods { items { id code name } }
    }
  `);
  return data.shippingMethods.items.find((item) => item.code === 'pickup-almaty')?.id ||
    data.shippingMethods.items[0]?.id ||
    null;
};

export const getVendureCommerceMethods = async () => {
  if (!isVendureAdminConfigured()) {
    return {
      source: 'fallback',
      shippingMethods: [{ code: 'manager', name: 'Согласовать с менеджером', enabled: true }],
      paymentMethods: [{ code: 'manager-confirmation', name: 'Оплата после подтверждения', enabled: true }],
    };
  }

  const data = await vendureAdminRequest(`
    query CommerceMethods {
      shippingMethods { items { id code name description } }
      paymentMethods { items { id code name enabled } }
    }
  `);

  return {
    source: 'vendure',
    shippingMethods: data.shippingMethods.items,
    paymentMethods: data.paymentMethods.items,
  };
};

export const quoteVendureCheckout = async ({ items = [] } = {}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (!normalizedItems.length) {
    return {
      ok: false,
      source: isVendureAdminConfigured() ? 'vendure' : 'fallback',
      lines: [],
      unavailable: [],
      totalQuantity: 0,
      subTotalWithTax: 0,
      shippingWithTax: 0,
      totalWithTax: 0,
      currencyCode: 'KZT',
      message: 'Cart is empty',
    };
  }

  if (!isVendureAdminConfigured()) {
    const lines = normalizedItems.map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const unitPrice = Number(item.price) || 0;
      return {
        productId: item.productId || item.slug || item.sku,
        productSlug: item.slug || item.productId,
        sku: item.sku,
        title: item.title,
        requestedQuantity: quantity,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        currencyCode: 'KZT',
        stockLevel: item.inStock === false ? 'OUT_OF_STOCK' : 'IN_STOCK',
        stockQty: Number(item.stockQty || 0),
        inStock: item.inStock !== false,
      };
    });
    return {
      ok: lines.every((line) => line.inStock),
      source: 'fallback',
      lines,
      unavailable: lines.filter((line) => !line.inStock),
      totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      subTotalWithTax: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      shippingWithTax: 0,
      totalWithTax: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      currencyCode: 'KZT',
    };
  }

  const products = (await fetchVendureProducts({ take: 1000 })).items;
  const lines = [];
  const unavailable = [];

  for (const item of normalizedItems) {
    const product = findProductForItem(products, item);
    const variant = product ? findVariantForItem([product], item) : null;
    if (!product || !variant) {
      unavailable.push({
        productId: item.productId || item.slug || item.sku,
        sku: item.sku,
        title: item.title,
        reason: 'not_found',
      });
      continue;
    }
    const line = normalizeOrderLine({ item, product, variant });
    lines.push(line);
    if (!line.inStock) {
      unavailable.push({ ...line, reason: 'insufficient_stock' });
    }
  }

  const subTotalWithTax = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    ok: unavailable.length === 0 && lines.length === normalizedItems.length,
    source: 'vendure',
    lines,
    unavailable,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    subTotalWithTax,
    shippingWithTax: 0,
    totalWithTax: subTotalWithTax,
    currencyCode: lines[0]?.currencyCode || 'KZT',
  };
};

const addDraftOrderMetadata = async (draftOrder, order) => {
  const customFields = {
    localOrderId: order.id,
    source: order.source || 'shop',
    contactMethod: order.contactMethod || '',
    deliveryMethod: order.deliveryMethod || '',
    managerStatus: 'new',
    customerComment: order.comment || '',
  };

  try {
    const data = await vendureAdminRequest(`
      mutation SetDraftOrderCustomFields($orderId: ID!, $input: UpdateOrderInput!) {
        setDraftOrderCustomFields(orderId: $orderId, input: $input) {
          ${ORDER_FIELDS}
        }
      }
    `, {
      orderId: draftOrder.id,
      input: {
        id: draftOrder.id,
        customFields,
      },
    });
    return data.setDraftOrderCustomFields || draftOrder;
  } catch (error) {
    console.warn('[vendure.order.custom_fields_skipped]', error.message);
    return draftOrder;
  }
};

const addOrderNote = async ({ orderId, note, isPublic = false }) => {
  if (!note) return null;
  const data = await vendureAdminRequest(`
    mutation AddNoteToOrder($input: AddNoteToOrderInput!) {
      addNoteToOrder(input: $input) {
        ${ORDER_FIELDS}
      }
    }
  `, {
    input: {
      id: orderId,
      note,
      isPublic,
    },
  });
  return data.addNoteToOrder;
};

export const createVendureDraftOrderFromShopOrder = async (order) => {
  if (!isVendureAdminConfigured()) {
    return { ok: false, skipped: true, reason: 'Vendure Admin API is not configured' };
  }
  if (!order?.items?.length) {
    return { ok: false, skipped: true, reason: 'Order has no items' };
  }

  const products = (await fetchVendureProducts({ take: 1000 })).items;
  const quote = await quoteVendureCheckout({ items: order.items });
  if (!quote.ok) {
    return { ok: false, reason: 'quote_failed', quote };
  }

  const draftData = await vendureAdminRequest(`
    mutation CreateDraftOrder {
      createDraftOrder {
        ${ORDER_FIELDS}
      }
    }
  `);
  let draftOrder = draftData.createDraftOrder;

  for (const item of order.items) {
    const product = findProductForItem(products, item);
    const variant = product ? findVariantForItem([product], item) : null;
    if (!variant) continue;
    const data = await vendureAdminRequest(`
      mutation AddItemToDraftOrder($orderId: ID!, $input: AddItemToDraftOrderInput!) {
        addItemToDraftOrder(orderId: $orderId, input: $input) {
          ... on Order { ${ORDER_FIELDS} }
          ... on ErrorResult { errorCode message }
        }
      }
    `, {
      orderId: draftOrder.id,
      input: {
        productVariantId: variant.id,
        quantity: Number(item.quantity) || 1,
      },
    });
    if (data.addItemToDraftOrder?.errorCode) {
      throw new Error(data.addItemToDraftOrder.message);
    }
    draftOrder = data.addItemToDraftOrder;
  }

  const customerName = splitName(order.customerName);
  const customerData = await vendureAdminRequest(`
    mutation SetCustomerForDraftOrder($orderId: ID!, $input: CreateCustomerInput!) {
      setCustomerForDraftOrder(orderId: $orderId, input: $input) {
        ... on Order { ${ORDER_FIELDS} }
        ... on ErrorResult { errorCode message }
      }
    }
  `, {
    orderId: draftOrder.id,
    input: {
      firstName: customerName.firstName,
      lastName: customerName.lastName,
      phoneNumber: normalizePhone(order.phone),
      emailAddress: emailFromPhone(order.phone),
    },
  });
  if (customerData.setCustomerForDraftOrder?.errorCode) {
    throw new Error(customerData.setCustomerForDraftOrder.message);
  }
  draftOrder = customerData.setCustomerForDraftOrder;

  const addressData = await vendureAdminRequest(`
    mutation SetDraftOrderShippingAddress($orderId: ID!, $input: CreateAddressInput!) {
      setDraftOrderShippingAddress(orderId: $orderId, input: $input) {
        ${ORDER_FIELDS}
      }
    }
  `, {
    orderId: draftOrder.id,
    input: {
      fullName: order.customerName || 'Клиент',
      streetLine1: order.deliveryMethod || 'Согласовать с менеджером',
      city: order.city || 'Алматы',
      countryCode: 'KZ',
      phoneNumber: normalizePhone(order.phone),
    },
  });
  draftOrder = addressData.setDraftOrderShippingAddress;

  const shippingMethodId = await getShippingMethodId();
  if (shippingMethodId) {
    const shippingData = await vendureAdminRequest(`
      mutation SetDraftOrderShippingMethod($orderId: ID!, $shippingMethodId: ID!) {
        setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $shippingMethodId) {
          ... on Order { ${ORDER_FIELDS} }
          ... on ErrorResult { errorCode message }
        }
      }
    `, {
      orderId: draftOrder.id,
      shippingMethodId,
    });
    if (shippingData.setDraftOrderShippingMethod?.errorCode) {
      throw new Error(shippingData.setDraftOrderShippingMethod.message);
    }
    draftOrder = shippingData.setDraftOrderShippingMethod;
  }

  draftOrder = await addDraftOrderMetadata(draftOrder, order);
  if (order.comment) {
    draftOrder = await addOrderNote({
      orderId: draftOrder.id,
      note: `Комментарий клиента: ${order.comment}`,
      isPublic: false,
    }) || draftOrder;
  }

  return {
    ok: true,
    quote,
    order: draftOrder,
  };
};

export const fetchVendureOrder = async ({ id, code }) => {
  if (!isVendureAdminConfigured()) {
    return { ok: false, skipped: true, reason: 'Vendure Admin API is not configured' };
  }
  const query = id ? `
    query Order($id: ID!) {
      order(id: $id) { ${ORDER_FIELDS} }
    }
  ` : `
    query OrderByCode($code: String!) {
      orderByCode(code: $code) { ${ORDER_FIELDS} }
    }
  `;
  const data = await vendureAdminRequest(query, id ? { id } : { code });
  const order = data.order || data.orderByCode;
  return order ? { ok: true, order } : { ok: false, reason: 'not_found' };
};

export const applyVendureOrderAction = async ({ orderId, action, note, state, paymentMethod, transactionId }) => {
  if (!isVendureAdminConfigured()) {
    return { ok: false, skipped: true, reason: 'Vendure Admin API is not configured' };
  }
  if (!orderId) {
    return { ok: false, reason: 'orderId is required' };
  }
  if (!action) {
    return { ok: false, reason: 'action is required' };
  }

  if (action === 'note') {
    const order = await addOrderNote({ orderId, note: note || 'Обновление менеджера', isPublic: false });
    return { ok: true, action, order };
  }

  if (action === 'transition') {
    if (!state) {
      return { ok: false, action, reason: 'state is required for transition action' };
    }
    const data = await vendureAdminRequest(`
      mutation TransitionOrder($id: ID!, $state: String!) {
        transitionOrderToState(id: $id, state: $state) {
          ... on Order { ${ORDER_FIELDS} }
          ... on OrderStateTransitionError { errorCode message transitionError fromState toState }
        }
      }
    `, { id: orderId, state });
    const result = data.transitionOrderToState;
    return result?.errorCode ? { ok: false, action, error: result } : { ok: true, action, order: result };
  }

  if (action === 'manual-payment') {
    const data = await vendureAdminRequest(`
      mutation AddManualPayment($input: ManualPaymentInput!) {
        addManualPaymentToOrder(input: $input) {
          ... on Order { ${ORDER_FIELDS} }
          ... on ErrorResult { errorCode message }
        }
      }
    `, {
      input: {
        orderId,
        method: paymentMethod || 'manager-confirmation',
        transactionId: transactionId || `manager-${Date.now()}`,
        metadata: {
          source: 'backend-svet',
          note: note || 'Оплата будет подтверждена менеджером',
        },
      },
    });
    const result = data.addManualPaymentToOrder;
    return result?.errorCode ? { ok: false, action, error: result } : { ok: true, action, order: result };
  }

  if (action === 'fulfill') {
    const current = await fetchVendureOrder({ id: orderId });
    if (!current.ok) {
      return { ok: false, action, reason: current.reason || 'order_not_found' };
    }
    const lines = current.order.lines.map((line) => ({
      orderLineId: line.id,
      quantity: line.quantity,
    }));
    const data = await vendureAdminRequest(`
      mutation FulfillOrder($input: FulfillOrderInput!) {
        addFulfillmentToOrder(input: $input) {
          ... on Fulfillment { id state method trackingCode }
          ... on ErrorResult { errorCode message }
        }
      }
    `, {
      input: {
        lines,
        handler: {
          code: 'manual-fulfillment',
          arguments: [],
        },
      },
    });
    const result = data.addFulfillmentToOrder;
    if (result?.errorCode) {
      return { ok: false, action, error: result };
    }
    const order = await fetchVendureOrder({ id: orderId });
    return { ok: true, action, fulfillment: result, order: order.order };
  }

  if (action === 'cancel') {
    const data = await vendureAdminRequest(`
      mutation CancelOrder($input: CancelOrderInput!) {
        cancelOrder(input: $input) {
          ... on Order { ${ORDER_FIELDS} }
          ... on ErrorResult { errorCode message }
        }
      }
    `, {
      input: {
        orderId,
        cancelShipping: true,
        reason: note || 'Cancelled by manager',
      },
    });
    const result = data.cancelOrder;
    return result?.errorCode ? { ok: false, action, error: result } : { ok: true, action, order: result };
  }

  return { ok: false, reason: `Unsupported action: ${action}` };
};
