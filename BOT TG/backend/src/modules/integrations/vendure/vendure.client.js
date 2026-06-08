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

export const isVendureConfigured = () => Boolean(adminApiUrl() || shopApiUrl());

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

  return payload.data;
};

export const vendureAdminRequest = (query, variables = {}) => requestGraphql({
  endpoint: adminApiUrl(),
  query,
  variables,
  token: process.env.VENDURE_ADMIN_TOKEN,
});

export const vendureShopRequest = (query, variables = {}) => requestGraphql({
  endpoint: shopApiUrl(),
  query,
  variables,
});

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
          facetValues { id name facet { id name } }
          variants {
            id
            name
            sku
            price
            currencyCode
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
          totalWithTax
          currencyCode
          createdAt
          updatedAt
          customer { id firstName lastName phoneNumber emailAddress }
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
