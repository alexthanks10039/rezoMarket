const normalizeUrl = (value) => String(value || '').trim().replace(/\/$/, '');

const adminApiUrl = () => {
  const explicit = normalizeUrl(process.env.VENDURE_ADMIN_API_URL);
  if (explicit) return explicit;
  const base = normalizeUrl(process.env.VENDURE_API_URL);
  return base ? `${base}/admin-api` : '';
};

const shopApiUrl = () => {
  const explicit = normalizeUrl(process.env.VENDURE_SHOP_API_URL);
  if (explicit) return explicit;
  const base = normalizeUrl(process.env.VENDURE_API_URL);
  return base ? `${base}/shop-api` : '';
};

let cachedAdminToken = '';

export const isVendureConfigured = () => Boolean(adminApiUrl() || shopApiUrl());
export const isVendureAdminConfigured = () => Boolean(adminApiUrl());
export const isVendureShopConfigured = () => Boolean(shopApiUrl());

const requestGraphql = async ({ endpoint, query, variables, token }) => {
  if (!endpoint) {
    throw new Error('Vendure endpoint is not configured');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.[0]?.message || response.statusText || 'Vendure request failed';
    throw new Error(message);
  }

  return { data: payload.data, response };
};

export const loginVendureAdmin = async ({ force = false } = {}) => {
  if (process.env.VENDURE_ADMIN_TOKEN && !force) {
    return process.env.VENDURE_ADMIN_TOKEN;
  }
  if (cachedAdminToken && !force) {
    return cachedAdminToken;
  }

  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD are required for Vendure Admin API login');
  }

  const { data, response } = await requestGraphql({
    endpoint: adminApiUrl(),
    query: `
      mutation Login($username: String!, $password: String!) {
        login(username: $username, password: $password) {
          __typename
          ... on CurrentUser { id identifier }
          ... on ErrorResult { errorCode message }
        }
      }
    `,
    variables: { username, password },
  });

  if (data.login?.__typename !== 'CurrentUser') {
    throw new Error(data.login?.message || 'Vendure Admin API login failed');
  }

  cachedAdminToken = response.headers.get('vendure-auth-token') || '';
  if (!cachedAdminToken) {
    throw new Error('Vendure Admin API did not return vendure-auth-token');
  }
  return cachedAdminToken;
};

export const vendureAdminRequest = async (query, variables = {}) => {
  const token = await loginVendureAdmin();
  const { data } = await requestGraphql({
    endpoint: adminApiUrl(),
    query,
    variables,
    token,
  });
  return data;
};

export const vendureShopRequest = async (query, variables = {}) => {
  const { data } = await requestGraphql({
    endpoint: shopApiUrl(),
    query,
    variables,
  });
  return data;
};

export const fetchVendureCollections = async ({ take = 200, skip = 0 } = {}) => {
  const data = await vendureAdminRequest(`
    query Collections($take: Int!, $skip: Int!) {
      collections(options: { take: $take, skip: $skip }) {
        totalItems
        items { id slug name }
      }
    }
  `, { take, skip });

  return data.collections;
};

export const fetchVendureFacets = async ({ take = 200, skip = 0 } = {}) => {
  const data = await vendureAdminRequest(`
    query Facets($take: Int!, $skip: Int!) {
      facets(options: { take: $take, skip: $skip }) {
        totalItems
        items {
          id
          code
          name
          values { id code name }
        }
      }
    }
  `, { take, skip });

  return data.facets;
};

export const fetchVendureProducts = async ({ take = 100, skip = 0 } = {}) => {
  const data = await vendureAdminRequest(`
    query Products($take: Int!, $skip: Int!) {
      products(options: { take: $take, skip: $skip }) {
        totalItems
        items {
          id
          slug
          name
          description
          enabled
          createdAt
          updatedAt
          customFields {
            externalSku
            size
            innerDiameter
            outerDiameter
            width
            material
            brand
            applianceType
            applianceBrand
            applianceModel
            compatibility
            analogs
            supplierCode
            isPopular
            searchKeywords
            metaTitle
            metaDescription
          }
          collections { id slug name }
          facetValues { id code name facet { id code name } }
          variants {
            id
            name
            sku
            price
            currencyCode
            stockOnHand
            stockLevel
            customFields {
              size
              innerDiameter
              outerDiameter
              width
              material
              brand
              applianceType
              applianceBrand
              applianceModel
              compatibility
              analogs
              supplierCode
              isPopular
              searchKeywords
              metaTitle
              metaDescription
            }
          }
        }
      }
    }
  `, { take, skip });

  return data.products;
};

export const fetchVendureOrders = async ({ take = 50, skip = 0 } = {}) => {
  const data = await vendureAdminRequest(`
    query Orders($take: Int!, $skip: Int!) {
      orders(options: { take: $take, skip: $skip, sort: { createdAt: DESC } }) {
        totalItems
        items {
          id
          code
          state
          active
          totalQuantity
          subTotalWithTax
          shippingWithTax
          totalWithTax
          currencyCode
          createdAt
          updatedAt
          customer { id firstName lastName phoneNumber emailAddress }
          payments { id method state amount transactionId }
          fulfillments { id state method trackingCode }
          shippingLines { shippingMethod { id code name } priceWithTax }
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
            linePriceWithTax
          }
        }
      }
    }
  `, { take, skip });

  return data.orders;
};
