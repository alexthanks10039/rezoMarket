import * as shopStore from '../../../shop/store.js';
import {
  fetchVendureCollections,
  fetchVendureFacets,
  fetchVendureProducts,
  isVendureAdminConfigured,
  vendureAdminRequest,
} from './vendure.client.js';
import { logVendureSync, syncProductsFromVendure, upsertProductKnowledgeSnapshot } from './vendure.sync.service.js';

const LANGUAGE_CODE = 'ru';
const CATEGORY_FACET_CODE = 'shop-category';
const BRAND_FACET_CODE = 'brand';
const MATERIAL_FACET_CODE = 'material';

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[а]/g, 'a')
  .replace(/[б]/g, 'b')
  .replace(/[в]/g, 'v')
  .replace(/[г]/g, 'g')
  .replace(/[д]/g, 'd')
  .replace(/[её]/g, 'e')
  .replace(/[ж]/g, 'zh')
  .replace(/[з]/g, 'z')
  .replace(/[и]/g, 'i')
  .replace(/[й]/g, 'y')
  .replace(/[к]/g, 'k')
  .replace(/[л]/g, 'l')
  .replace(/[м]/g, 'm')
  .replace(/[н]/g, 'n')
  .replace(/[о]/g, 'o')
  .replace(/[п]/g, 'p')
  .replace(/[р]/g, 'r')
  .replace(/[с]/g, 's')
  .replace(/[т]/g, 't')
  .replace(/[у]/g, 'u')
  .replace(/[ф]/g, 'f')
  .replace(/[х]/g, 'h')
  .replace(/[ц]/g, 'c')
  .replace(/[ч]/g, 'ch')
  .replace(/[ш]/g, 'sh')
  .replace(/[щ]/g, 'sch')
  .replace(/[ъь]/g, '')
  .replace(/[ы]/g, 'y')
  .replace(/[э]/g, 'e')
  .replace(/[ю]/g, 'yu')
  .replace(/[я]/g, 'ya')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'item';

const uniqueBy = (items, keyFn) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const stringList = (value) => Array.isArray(value) ? value.filter(Boolean).join(', ') : String(value || '');

const productCustomFieldsFromProduct = (product) => ({
  externalSku: product.sku,
  ...variantCustomFieldsFromProduct(product),
});

const variantCustomFieldsFromProduct = (product) => ({
  size: product.size || '',
  innerDiameter: Number(product.specs?.['Внутренний диаметр']?.replace(/[^\d.,]/g, '').replace(',', '.')) || null,
  outerDiameter: Number(product.specs?.['Внешний диаметр']?.replace(/[^\d.,]/g, '').replace(',', '.')) || null,
  width: Number(product.specs?.['Толщина']?.replace(/[^\d.,]/g, '').replace(',', '.')) || null,
  material: product.material || '',
  brand: product.brand || '',
  applianceType: product.applianceType || '',
  compatibility: stringList(product.compatibility),
  analogs: stringList(product.analogs),
  isPopular: Boolean(product.isPopular || product.oldPrice),
  searchKeywords: [
    product.title,
    product.sku,
    product.size,
    product.brand,
    product.material,
    product.applianceType,
    ...(product.tags || []),
    ...(product.compatibility || []),
  ].filter(Boolean).join(' '),
  metaTitle: product.title,
  metaDescription: product.description || '',
});

const translation = ({ name, slug, description = '' }) => ({
  languageCode: LANGUAGE_CODE,
  name,
  slug,
  description,
});

const operationArg = (name, value) => ({ name, value: String(value) });

const ensureFacet = async ({ code, name, values }) => {
  const existingFacets = (await fetchVendureFacets()).items;
  let facet = existingFacets.find((item) => item.code === code);
  if (!facet) {
    const data = await vendureAdminRequest(`
      mutation CreateFacet($input: CreateFacetInput!) {
        createFacet(input: $input) {
          id
          code
          name
          values { id code name }
        }
      }
    `, {
      input: {
        code,
        isPrivate: false,
        translations: [{ languageCode: LANGUAGE_CODE, name }],
        values: values.map((value) => ({
          code: value.code,
          translations: [{ languageCode: LANGUAGE_CODE, name: value.name }],
        })),
      },
    });
    return data.createFacet;
  }

  const existingValueCodes = new Set((facet.values || []).map((value) => value.code));
  const missingValues = values.filter((value) => !existingValueCodes.has(value.code));
  if (missingValues.length) {
    await vendureAdminRequest(`
      mutation CreateFacetValues($input: [CreateFacetValueInput!]!) {
        createFacetValues(input: $input) { id code name }
      }
    `, {
      input: missingValues.map((value) => ({
        facetId: facet.id,
        code: value.code,
        translations: [{ languageCode: LANGUAGE_CODE, name: value.name }],
      })),
    });
    facet = (await fetchVendureFacets()).items.find((item) => item.code === code) || facet;
  }

  return facet;
};

const ensureCollection = async ({ category, categoryFacetValueId }) => {
  const existing = (await fetchVendureCollections()).items.find((item) => item.slug === category.slug);
  if (existing) return { collection: existing, created: false };

  const data = await vendureAdminRequest(`
    mutation CreateCollection($input: CreateCollectionInput!) {
      createCollection(input: $input) {
        id
        slug
        name
      }
    }
  `, {
    input: {
      isPrivate: false,
      inheritFilters: true,
      filters: [{
        code: 'facet-value-filter',
        arguments: [
          operationArg('facetValueIds', JSON.stringify([categoryFacetValueId])),
          operationArg('containsAny', 'true'),
          operationArg('combineWithAnd', 'true'),
        ],
      }],
      translations: [translation({
        name: category.title,
        slug: category.slug,
        description: category.description || '',
      })],
    },
  });

  return { collection: data.createCollection, created: true };
};

const ensureKazakhstanCommerceSettings = async () => {
  const countryData = await vendureAdminRequest(`
    query Countries {
      countries(options: { take: 200 }) { items { id code name enabled } }
      zones { items { id name members { id code } } }
      activeChannel { id code defaultTaxZone { id } defaultShippingZone { id } defaultLanguageCode defaultCurrencyCode availableCurrencyCodes }
      taxCategories { items { id name isDefault } }
      taxRates { items { id name value } }
      shippingMethods { items { id code name } }
      paymentMethods { items { id code name enabled } }
    }
  `);

  let country = countryData.countries.items.find((item) => item.code === 'KZ');
  if (!country) {
    const data = await vendureAdminRequest(`
      mutation CreateCountry($input: CreateCountryInput!) {
        createCountry(input: $input) { id code name enabled }
      }
    `, {
      input: {
        code: 'KZ',
        enabled: true,
        translations: [{ languageCode: LANGUAGE_CODE, name: 'Казахстан' }],
      },
    });
    country = data.createCountry;
  }

  let zone = countryData.zones.items.find((item) => item.name === 'Казахстан');
  if (!zone) {
    const data = await vendureAdminRequest(`
      mutation CreateZone($input: CreateZoneInput!) {
        createZone(input: $input) { id name }
      }
    `, { input: { name: 'Казахстан', memberIds: [country.id] } });
    zone = data.createZone;
  }

  const activeChannel = countryData.activeChannel;
  if (
    activeChannel &&
    (
      activeChannel.defaultTaxZone?.id !== zone.id ||
      activeChannel.defaultShippingZone?.id !== zone.id ||
      activeChannel.defaultCurrencyCode !== 'KZT' ||
      activeChannel.defaultLanguageCode !== LANGUAGE_CODE ||
      !(activeChannel.availableCurrencyCodes || []).includes('KZT')
    )
  ) {
    await vendureAdminRequest(`
      mutation UpdateChannel($input: UpdateChannelInput!) {
        updateChannel(input: $input) {
          ... on Channel {
            id
            code
            defaultTaxZone { id name }
            defaultShippingZone { id name }
          }
          ... on ErrorResult {
            errorCode
            message
          }
        }
      }
    `, {
      input: {
        id: activeChannel.id,
        defaultLanguageCode: LANGUAGE_CODE,
        availableLanguageCodes: [LANGUAGE_CODE],
        defaultCurrencyCode: 'KZT',
        availableCurrencyCodes: Array.from(new Set([...(activeChannel.availableCurrencyCodes || []), 'KZT'])),
        defaultTaxZoneId: zone.id,
        defaultShippingZoneId: zone.id,
      },
    });
  }

  let taxCategory = countryData.taxCategories.items.find((item) => item.name === 'Без НДС') ||
    countryData.taxCategories.items.find((item) => item.isDefault);
  if (!taxCategory) {
    const data = await vendureAdminRequest(`
      mutation CreateTaxCategory($input: CreateTaxCategoryInput!) {
        createTaxCategory(input: $input) { id name isDefault }
      }
    `, { input: { name: 'Без НДС', isDefault: true } });
    taxCategory = data.createTaxCategory;
  }

  const hasTaxRate = countryData.taxRates.items.some((item) => item.name === 'KZ 0%');
  if (!hasTaxRate) {
    await vendureAdminRequest(`
      mutation CreateTaxRate($input: CreateTaxRateInput!) {
        createTaxRate(input: $input) { id name value }
      }
    `, {
      input: {
        name: 'KZ 0%',
        enabled: true,
        value: 0,
        categoryId: taxCategory.id,
        zoneId: zone.id,
      },
    });
  }

  const shippingMethods = countryData.shippingMethods.items;
  if (!shippingMethods.some((item) => item.code === 'pickup-almaty')) {
    await vendureAdminRequest(`
      mutation CreateShippingMethod($input: CreateShippingMethodInput!) {
        createShippingMethod(input: $input) { id code name }
      }
    `, {
      input: {
        code: 'pickup-almaty',
        fulfillmentHandler: 'manual-fulfillment',
        checker: {
          code: 'default-shipping-eligibility-checker',
          arguments: [operationArg('orderMinimum', 0)],
        },
        calculator: {
          code: 'default-shipping-calculator',
          arguments: [
            operationArg('rate', 0),
            operationArg('includesTax', 'auto'),
            operationArg('taxRate', 0),
          ],
        },
        translations: [{
          languageCode: LANGUAGE_CODE,
          name: 'Самовывоз Алматы',
          description: 'Менеджер подтвердит наличие и согласует получение.',
        }],
      },
    });
  }

  const paymentMethods = countryData.paymentMethods.items;
  if (!paymentMethods.some((item) => item.code === 'manager-confirmation')) {
    await vendureAdminRequest(`
      mutation CreatePaymentMethod($input: CreatePaymentMethodInput!) {
        createPaymentMethod(input: $input) { id code name enabled }
      }
    `, {
      input: {
        code: 'manager-confirmation',
        enabled: true,
        handler: {
          code: 'dummy-payment-handler',
          arguments: [operationArg('automaticSettle', 'false')],
        },
        translations: [{
          languageCode: LANGUAGE_CODE,
          name: 'Оплата после подтверждения',
          description: 'Заказ подтверждается менеджером до оплаты.',
        }],
      },
    });
  }

  return { country: 'KZ', zone: 'Казахстан', taxCategory: taxCategory.name };
};

const ensureProduct = async ({ product, facetValueIds, existingBySlug, existingVariantBySku }) => {
  const productCustomFields = productCustomFieldsFromProduct(product);
  const variantCustomFields = variantCustomFieldsFromProduct(product);
  const existing = existingBySlug.get(product.slug);
  let vendureProduct = existing;

  if (existing) {
    const data = await vendureAdminRequest(`
      mutation UpdateProduct($input: UpdateProductInput!) {
        updateProduct(input: $input) {
          id
          slug
          name
          variants { id sku }
        }
      }
    `, {
      input: {
        id: existing.id,
        enabled: product.isActive !== false,
        facetValueIds,
        translations: [translation({
          name: product.title,
          slug: product.slug,
          description: product.description || '',
        })],
        customFields: productCustomFields,
      },
    });
    vendureProduct = data.updateProduct;
  } else {
    const data = await vendureAdminRequest(`
      mutation CreateProduct($input: CreateProductInput!) {
        createProduct(input: $input) {
          id
          slug
          name
          variants { id sku }
        }
      }
    `, {
      input: {
        enabled: product.isActive !== false,
        facetValueIds,
        translations: [translation({
          name: product.title,
          slug: product.slug,
          description: product.description || '',
        })],
        customFields: productCustomFields,
      },
    });
    vendureProduct = data.createProduct;
  }

  const variantInput = {
    enabled: product.isActive !== false,
    translations: [{ languageCode: LANGUAGE_CODE, name: product.title }],
    facetValueIds,
    sku: product.sku,
    price: Number(product.price) || 0,
    stockOnHand: Number(product.stockQty) || 0,
    trackInventory: 'TRUE',
    customFields: variantCustomFields,
  };

  const existingVariant = existingVariantBySku.get(product.sku) || vendureProduct.variants?.find((variant) => variant.sku === product.sku);
  if (existingVariant) {
    await vendureAdminRequest(`
      mutation UpdateProductVariant($input: UpdateProductVariantInput!) {
        updateProductVariant(input: $input) { id sku name }
      }
    `, { input: { id: existingVariant.id, ...variantInput } });
    return { product: vendureProduct, action: 'updated' };
  }

  await vendureAdminRequest(`
    mutation CreateProductVariants($input: [CreateProductVariantInput!]!) {
      createProductVariants(input: $input) { id sku name }
    }
  `, {
    input: [{
      productId: vendureProduct.id,
      ...variantInput,
    }],
  });
  return { product: vendureProduct, action: existing ? 'updated' : 'created' };
};

export const importSeedCatalogToVendure = async () => {
  if (!isVendureAdminConfigured()) {
    return { source: 'fallback', imported: 0, warning: 'Vendure Admin API is not configured.' };
  }

  const categories = shopStore.listCategories();
  const products = shopStore.listProducts({ page: 1, limit: 1000 }).items;
  const categoryFacet = await ensureFacet({
    code: CATEGORY_FACET_CODE,
    name: 'Категория магазина',
    values: categories.map((category) => ({ code: category.slug, name: category.title })),
  });
  const brandFacet = await ensureFacet({
    code: BRAND_FACET_CODE,
    name: 'Бренд',
    values: uniqueBy(products
      .filter((product) => product.brand)
      .map((product) => ({ code: slugify(product.brand), name: product.brand })), (item) => item.code),
  });
  const materialFacet = await ensureFacet({
    code: MATERIAL_FACET_CODE,
    name: 'Материал',
    values: uniqueBy(products
      .filter((product) => product.material)
      .map((product) => ({ code: slugify(product.material), name: product.material })), (item) => item.code),
  });

  const categoryValuesByCode = new Map((categoryFacet.values || []).map((value) => [value.code, value]));
  const brandValuesByCode = new Map((brandFacet.values || []).map((value) => [value.code, value]));
  const materialValuesByCode = new Map((materialFacet.values || []).map((value) => [value.code, value]));

  const collectionResults = [];
  for (const category of categories) {
    const categoryFacetValue = categoryValuesByCode.get(category.slug);
    if (!categoryFacetValue) continue;
    collectionResults.push(await ensureCollection({ category, categoryFacetValueId: categoryFacetValue.id }));
  }

  const existingProducts = (await fetchVendureProducts({ take: 1000 })).items;
  const existingBySlug = new Map(existingProducts.map((product) => [product.slug, product]));
  const existingVariantBySku = new Map(existingProducts.flatMap((product) => (
    product.variants || []
  ).map((variant) => [variant.sku, variant])));

  const commerceSettings = await ensureKazakhstanCommerceSettings();
  const productResults = [];
  for (const product of products) {
    const facetValueIds = [
      categoryValuesByCode.get(product.category?.slug || product.categoryId)?.id,
      brandValuesByCode.get(slugify(product.brand))?.id,
      materialValuesByCode.get(slugify(product.material))?.id,
    ].filter(Boolean);
    const result = await ensureProduct({ product, facetValueIds, existingBySlug, existingVariantBySku });
    productResults.push(result);
    upsertProductKnowledgeSnapshot(product);
  }

  const syncResult = await syncProductsFromVendure();

  const result = {
    source: 'vendure',
    categories: categories.length,
    collectionsCreated: collectionResults.filter((item) => item.created).length,
    products: products.length,
    created: productResults.filter((item) => item.action === 'created').length,
    updated: productResults.filter((item) => item.action === 'updated').length,
    indexed: syncResult.indexed,
    commerceSettings,
  };

  logVendureSync({
    eventType: 'manual.seed.import',
    entityType: 'catalog',
    status: 'success',
    payload: result,
  });

  return result;
};
