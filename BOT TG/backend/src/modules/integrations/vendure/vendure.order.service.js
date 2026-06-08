import { fetchVendureProducts, isVendureAdminConfigured, vendureAdminRequest } from './vendure.client.js';

const ORDER_FIELDS = `
  id
  code
  state
  totalWithTax
  currencyCode
  lines {
    id
    quantity
    productVariant { id sku name product { id slug name } }
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

export const createVendureDraftOrderFromShopOrder = async (order) => {
  if (!isVendureAdminConfigured()) {
    return { ok: false, skipped: true, reason: 'Vendure Admin API is not configured' };
  }
  if (!order?.items?.length) {
    return { ok: false, skipped: true, reason: 'Order has no items' };
  }

  const products = (await fetchVendureProducts({ take: 1000 })).items;
  const draftData = await vendureAdminRequest(`
    mutation CreateDraftOrder {
      createDraftOrder {
        ${ORDER_FIELDS}
      }
    }
  `);
  let draftOrder = draftData.createDraftOrder;

  for (const item of order.items) {
    const variant = findVariantForItem(products, item);
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

  return {
    ok: true,
    order: draftOrder,
  };
};
