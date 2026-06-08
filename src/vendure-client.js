const metaVendureUrl = document.querySelector('meta[name="vendure-api-url"]')?.content?.trim();
const VENDURE_SHOP_API_URL = metaVendureUrl || 'http://127.0.0.1:3002/shop-api';

export const vendureRequest = async (query, variables = {}) => {
  const response = await fetch(VENDURE_SHOP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || response.statusText || 'Vendure request failed');
  }
  return payload.data;
};

export const fetchVendureCatalog = ({ take = 24, skip = 0, term = '' } = {}) => vendureRequest(`
  query SearchProducts($take: Int!, $skip: Int!, $term: String) {
    search(input: { take: $take, skip: $skip, term: $term }) {
      totalItems
      items {
        productId
        productName
        slug
        sku
        description
        priceWithTax {
          ... on SinglePrice { value }
          ... on PriceRange { min max }
        }
        currencyCode
        productAsset { preview }
      }
    }
  }
`, { take, skip, term });

export const fetchVendureProduct = (slug) => vendureRequest(`
  query Product($slug: String!) {
    product(slug: $slug) {
      id
      name
      slug
      description
      customFields {
        sku
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
        isPopular
        searchKeywords
        metaTitle
        metaDescription
      }
      variants {
        id
        name
        sku
        priceWithTax
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
          isPopular
          searchKeywords
          metaTitle
          metaDescription
        }
      }
      assets { preview }
    }
  }
`, { slug });
