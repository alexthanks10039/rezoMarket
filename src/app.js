import * as api from './api.js';
import * as cartStore from './cart-store.js';

const appRoot = document.querySelector('#app');
let routeDefinitions;

const state = {
  categories: [],
  currentCart: null,
};

const createElement = (html) => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
};

const formatPrice = (value) => {
  const number = Number(value || 0);
  return `${number.toLocaleString('ru-RU')} ₸`;
};

const makePlaceholderImage = (label = 'Фото нет', width = 520, height = 360) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eef2fb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#667085" font-family="Inter, sans-serif" font-size="24">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const isExternalPlaceholder = (url) => {
  if (typeof url !== 'string') {
    return false;
  }

  return /(placeholder\.com|via\.placeholder\.com|placehold\.it)/i.test(url);
};

const getImageUrl = (url, label, width = 520, height = 360) => {
  if (!url || isExternalPlaceholder(url)) {
    return makePlaceholderImage(label, width, height);
  }

  return url;
};

const getTextValue = (value) => String(value || '').trim();

const addAnalytics = async (payload) => {
  try {
    await api.sendAnalyticsEvent(payload);
  } catch (error) {
    console.warn('[analytics.error]', error.message);
  }
};

const setPageTitle = (title) => {
  if (title) {
    document.title = title;
  }
};

const getCurrentPath = () => {
  if (window.location.hash.startsWith('#/')) {
    const hash = window.location.hash.slice(1);
    return hash.split('?')[0] || '/';
  }
  const pathname = window.location.pathname || '/';
  if (pathname.endsWith('index.html')) {
    return '/';
  }
  return pathname;
};

const getQueryParams = () => {
  const source = window.location.hash.startsWith('#/') ? window.location.hash.slice(1) : window.location.search;
  const queryString = source.includes('?') ? source.split('?')[1] : '';
  const params = new URLSearchParams(queryString);
  const result = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const buildUrl = (path, params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && String(value).trim() !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  const route = path.startsWith('#') ? path : `#${path}`;
  return `${route}${query ? `?${query}` : ''}`;
};

const getRouteHref = (path) => (path.startsWith('#') ? path : `#${path}`);

const getAdminBackdrop = () => document.querySelector('[data-admin-backdrop]');
const setAdminModalOpen = (isOpen) => {
  const backdrop = getAdminBackdrop();
  if (!backdrop) return;
  backdrop.classList.toggle('open', isOpen);
  if (isOpen) {
    const closeButton = backdrop.querySelector('.admin-close');
    closeButton?.focus();
  }
};

const updateCartBadge = () => {
  const count = state.currentCart?.itemCount || 0;
  document.querySelectorAll('[data-cart-count]').forEach((badge) => {
    badge.textContent = count > 0 ? String(count) : '';
  });
};

const setAppContent = (content) => {
  const container = document.querySelector('[data-app-content]');
  if (container) {
    container.innerHTML = '';
    container.appendChild(content);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const renderShell = () => {
  appRoot.innerHTML = `
    <header class="app-header">
      <div class="app-header-inner" data-app-header></div>
    </header>
    <div class="app-frame">
      <main class="app-main" data-app-content></main>
      <footer class="app-footer"></footer>
      <nav class="mobile-nav" data-mobile-nav></nav>
    </div>
    <button class="admin-launcher" type="button" aria-label="Открыть админ-панель">⚙</button>
    <div class="admin-backdrop" data-admin-backdrop>
      <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <div class="admin-modal-header">
          <h2 id="admin-modal-title">Админ-панель</h2>
          <button class="admin-close" type="button" aria-label="Закрыть админ-панель">×</button>
        </div>
        <div class="admin-modal-body" data-admin-modal-body></div>
      </div>
    </div>
  `;

  renderHeader();
  renderFooter();
  renderMobileNav();

  const adminButton = document.querySelector('.admin-launcher');
  if (adminButton) {
    adminButton.addEventListener('click', () => navigate('/admin'));
  }

  const backdrop = getAdminBackdrop();
  if (backdrop) {
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) {
        if (window.location.hash === '#/admin') {
          window.history.back();
        } else {
          setAdminModalOpen(false);
        }
      }
    });
  }

  const closeButton = document.querySelector('.admin-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      if (window.location.hash === '#/admin') {
        window.history.back();
      } else {
        setAdminModalOpen(false);
      }
    });
  }
};

const createNavItem = (href, label, icon, active = false) => {
  const badge = href === '/cart' ? '<span class="cart-count-badge" data-cart-count></span>' : '';

  return `<a class="nav-link ${active ? 'active' : ''}" data-link href="${getRouteHref(href)}">
      <span class="nav-icon">${icon}${badge}</span>
      <span>${label}</span>
    </a>`;
};

const renderHeader = () => {
  const header = document.querySelector('[data-app-header]');
  if (!header) return;
  const path = getCurrentPath();
  const navLinks = [
    { href: '/', label: 'Главная', icon: '🏠' },
    { href: '/catalog', label: 'Каталог', icon: '📦' },
    { href: '/search', label: 'Поиск', icon: '🔍' },
    { href: '/assistant', label: 'Помощник', icon: '🤖' },
    { href: '/cart', label: 'Корзина', icon: '🛒' },
  ];

  header.innerHTML = `
    <div class="header-start">
      <a class="brand" data-link href="${getRouteHref('/')}">
        <span class="brand-mark"></span>
        <span class="brand-title">Мир Сальников</span>
      </a>
      <div class="brand-subtitle">Запчасти и уплотнения для бытовой техники</div>
    </div>
    <div class="header-center">
      <nav class="desktop-menu">
        ${navLinks.map((item) => createNavItem(item.href, item.label, item.icon, path === item.href)).join('')}
      </nav>
    </div>
    <div class="header-actions">
      <a class="button button-primary" data-link href="${getRouteHref('/catalog')}">В каталог</a>
      <a class="button button-secondary" href="https://wa.me/77001234567" target="_blank">WhatsApp</a>
      <a class="button button-ghost header-phone" href="tel:+77001234567">+7 700 123 45 67</a>
    </div>
  `;
};

const renderFooter = () => {
  const footer = document.querySelector('.app-footer');
  if (!footer) return;
  footer.innerHTML = `
    <div class="footer-grid">
      <div>
        <div class="footer-brand">Мир Сальников</div>
        <p class="footer-text">Интернет-магазин запчастей, сальников и комплектующих для бытовой техники в Алматы.</p>
      </div>
      <div>
        <h3>Контакты</h3>
        <a href="tel:+77001234567">+7 700 123 45 67</a>
        <a href="https://wa.me/77001234567" target="_blank">WhatsApp</a>
        <a href="https://t.me/your_telegram" target="_blank">Telegram</a>
      </div>
      <div>
        <h3>Разделы</h3>
        <a data-link href="${getRouteHref('/catalog')}">Каталог</a>
        <a data-link href="${getRouteHref('/contacts')}">Контакты</a>
        <a data-link href="${getRouteHref('/how-to-order')}">Как заказать</a>
      </div>
    </div>
  `;
};

const renderMobileNav = () => {
  const nav = document.querySelector('[data-mobile-nav]');
  if (!nav) return;
  nav.innerHTML = `
    <a class="mobile-nav-item" data-link href="${getRouteHref('/')}">
      <span>🏠</span>
      <span>Главная</span>
    </a>
    <a class="mobile-nav-item" data-link href="${getRouteHref('/catalog')}">
      <span>📦</span>
      <span>Каталог</span>
    </a>
    <a class="mobile-nav-item" data-link href="${getRouteHref('/search')}">
      <span>🔍</span>
      <span>Поиск</span>
    </a>
    <a class="mobile-nav-item" data-link href="${getRouteHref('/cart')}">
      <span class="mobile-cart-icon">🛒<span class="cart-count-badge" data-cart-count></span></span>
      <span>Корзина</span>
    </a>
  `;
};

const renderLoading = (message = 'Загрузка...') => {
  const element = document.createElement('div');
  element.className = 'page-panel loading-panel';
  element.innerHTML = `
    <div class="loading-dot-grid">
      <span></span><span></span><span></span>
    </div>
    <p>${message}</p>
  `;
  return element;
};

const renderEmptyState = (title, description, actionLabel, actionHref) => {
  const element = document.createElement('div');
  element.className = 'empty-state';
  element.innerHTML = `
    <div class="empty-state-card">
      <p class="eyebrow">${title}</p>
      <h2>${description}</h2>
      ${actionLabel ? `<a data-link href="${getRouteHref(actionHref || '/')}" class="button button-primary">${actionLabel}</a>` : ''}
    </div>
  `;
  return element;
};

const renderHero = () => {
  const categoriesHtml = state.categories.slice(0, 5).map((category) => `<a class="chip" data-link href="${getRouteHref(`/catalog/${category.slug}`)}">${category.title}</a>`).join('');

  const hero = document.createElement('section');
  hero.className = 'hero-section';
  hero.innerHTML = `
    <div class="hero-copy">
      <p class="eyebrow">Алматы</p>
      <h1>Запчасти и сальники для техники в Алматы</h1>
      <p class="hero-text">Найдем нужную деталь по артикулу, размеру, модели техники или фото.</p>
      <form class="search-row" data-home-search>
        <input name="q" type="search" placeholder="Введите артикул, размер 35x62x10 или модель техники" autocomplete="off" />
        <button class="button button-primary" type="submit">Найти деталь</button>
      </form>
      <div class="hero-actions">
        <a class="button button-secondary" data-link href="${getRouteHref('/selection')}">Подобрать с менеджером</a>
        <a class="button button-ghost" href="https://wa.me/77001234567" target="_blank">Написать в WhatsApp</a>
      </div>
    </div>
    <div class="hero-panel">
      <div class="hero-stat-grid">
        <div class="hero-stat">
          <strong>12 000+</strong>
          <span>деталей и расходников</span>
        </div>
        <div class="hero-stat">
          <strong>WhatsApp и Telegram</strong>
          <span>быстрая связь</span>
        </div>
        <div class="hero-stat hero-stat-cta">
          <strong>В каталог</strong>
          <p>Переходите в каталог и выбирайте нужные запчасти за несколько кликов.</p>
          <a class="button button-primary" data-link href="${getRouteHref('/catalog')}">В каталог</a>
        </div>
      </div>
    </div>
  `;

  hero.querySelector('[data-home-search]').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = event.target.q.value.trim();
    if (query) {
      navigate(buildUrl('/search', { q: query }));
    }
  });

  return hero;
};

const renderCategoryChips = () => {
  const categoriesHtml = state.categories.slice(0, 5).map((category) => `<a class="chip" data-link href="${getRouteHref(`/catalog/${category.slug}`)}">${category.title}</a>`).join('');
  const section = document.createElement('section');
  section.className = 'section section-chip-band';
  section.innerHTML = `
    <div class="hero-chips">${categoriesHtml}</div>
  `;
  return section;
};

const renderFeatureCards = () => {
  const element = document.createElement('section');
  element.className = 'section';
  element.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Почему выбирают нас</span>
      <h2>Быстро, надежно, по размеру и модели техники</h2>
    </div>
    <div class="grid grid-3">
      <article class="feature-card">
        <h3>Поиск по артикулу и размеру</h3>
        <p>Вводите артикул или габарит детали — мы сразу покажем подходящие варианты.</p>
      </article>
      <article class="feature-card">
        <h3>Подбор без онлайн-оплаты</h3>
        <p>Оставьте заказ, менеджер подтвердит цену и наличие перед оплатой.</p>
      </article>
      <article class="feature-card">
        <h3>Найдем аналог</h3>
        <p>Если нужной детали нет, предложим доступный аналог и замену.</p>
      </article>
    </div>
  `;
  return element;
};

const renderCategoryGrid = () => {
  const element = document.createElement('section');
  element.className = 'section';
  element.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Категории</span>
      <h2>Основные разделы магазина</h2>
    </div>
    <div class="grid grid-4" data-category-grid></div>
  `;

  const grid = element.querySelector('[data-category-grid]');
  state.categories.forEach((category) => {
    const card = document.createElement('a');
    card.className = 'category-card';
    card.setAttribute('data-link', '');
    card.href = `/catalog/${category.slug}`;
    card.innerHTML = `
      <div class="category-card-image"></div>
      <div class="category-card-body">
        <h3>${category.title}</h3>
        <p>${category.description}</p>
      </div>
    `;
    grid.appendChild(card);
  });

  return element;
};

const renderProductCard = (product) => {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.innerHTML = `
    <a class="product-card-link" data-link href="${getRouteHref(`/product/${product.slug}`)}"></a>
    <div class="product-card-image" style="background-image:url('${getImageUrl(product.images?.[0], 'Фото нет', 520, 360)}')"></div>
    <div class="product-card-body">
      <span class="badge ${product.inStock ? 'badge-success' : 'badge-soft'}">${product.inStock ? 'В наличии' : 'Под заказ'}</span>
      <h3>${product.title}</h3>
      <p class="product-meta">${product.sku} · ${product.size || product.applianceType || 'универсально'}</p>
      <div class="product-price">
        <strong>${formatPrice(product.price)}</strong>
        ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ''}
      </div>
      <div class="product-actions">
        <button class="button button-sm button-primary" data-action="add-to-cart" data-product-id="${product.id}">В корзину</button>
        <a class="button button-sm button-secondary" href="https://wa.me/77001234567" target="_blank">WhatsApp</a>
      </div>
    </div>
  `;
  card.querySelector('[data-action="add-to-cart"]').addEventListener('click', async () => {
    await handleAddToCart(product.id);
  });
  return card;
};

const renderProductsSection = (title, products = [], ctaLabel = 'Смотреть каталог') => {
  const wrapper = document.createElement('section');
  wrapper.className = 'section';
  wrapper.innerHTML = `
    <div class="section-heading">
      <span class="kicker">${title}</span>
      <h2>Популярные товары</h2>
    </div>
    <div class="grid grid-4" data-product-grid></div>
    <div class="section-footer">
      <a class="button button-primary" data-link href="${getRouteHref('/catalog')}">${ctaLabel}</a>
    </div>
  `;
  const grid = wrapper.querySelector('[data-product-grid]');
  products.forEach((product) => grid.appendChild(renderProductCard(product)));
  return wrapper;
};

const renderTrustSection = () => {
  const section = document.createElement('section');
  section.className = 'section section-alt';
  section.innerHTML = `
    <div class="grid grid-4 trust-grid">
      <div class="trust-card"><strong>Город</strong><span>Алматы</span></div>
      <div class="trust-card"><strong>Про подбор</strong><span>По артикулу, размеру, модели</span></div>
      <div class="trust-card trust-card-cta">
        <strong>Больше деталей</strong>
        <p>Переходите в каталог и выбирайте подходящие запчасти.</p>
        <a class="button button-primary button-sm" data-link href="${getRouteHref('/catalog')}">В каталог</a>
      </div>
      <div class="trust-card"><strong>Связь</strong><span>WhatsApp / Telegram</span></div>
    </div>
  `;
  return section;
};

const renderHome = async () => {
  setPageTitle('Запчасти и сальники для бытовой техники в Алматы');
  addAnalytics({ eventType: 'shop_home_view', source: 'frontend' });

  const page = document.createElement('div');
  page.appendChild(renderHero());
  page.appendChild(renderCategoryChips());

  const loadingProducts = renderLoading('Загружаем товары...');
  page.appendChild(loadingProducts);
  page.appendChild(renderTrustSection());
  page.appendChild(renderFeatureCards());
  setAppContent(page);

  try {
    const response = await api.fetchProducts({ limit: 8, sort: 'newest' });
    const productsSection = renderProductsSection('Товары сегодня', response.items.slice(0, 8));
    page.replaceChild(productsSection, loadingProducts);
  } catch (error) {
    page.replaceChild(renderEmptyState('Ошибка загрузки', 'Не удалось загрузить товары. Попробуйте обновить страницу.', 'Перезагрузить', '/'), loadingProducts);
  }
};

const renderCatalog = async () => {
  const query = getQueryParams();
  setPageTitle('Каталог запчастей для бытовой техники');
  addAnalytics({ eventType: 'category_view', source: 'frontend', meta: { page: 'catalog', query } });

  const page = document.createElement('div');
  page.innerHTML = `
    <section class="section">
      <div class="section-heading">
        <span class="kicker">Каталог</span>
        <h2>Найдите нужную деталь в магазине</h2>
      </div>
      <form class="catalog-filters" data-filter-form>
        <div class="filter-row">
          <input name="search" type="search" placeholder="Поиск по артикулу, названию или модели" value="${query.search || ''}" />
          <select name="category">
            <option value="">Все категории</option>
            ${state.categories.map((category) => `<option value="${category.slug}" ${category.slug === query.category ? 'selected' : ''}>${category.title}</option>`).join('')}
          </select>
        </div>
        <div class="filter-row">
          <input name="brand" placeholder="Бренд" value="${query.brand || ''}" />
          <input name="size" placeholder="Размер / 35x62x10" value="${query.size || ''}" />
        </div>
        <div class="filter-row">
          <input name="applianceType" placeholder="Модель техники" value="${query.applianceType || ''}" />
          <select name="inStock">
            <option value="">Наличие</option>
            <option value="true" ${query.inStock === 'true' ? 'selected' : ''}>В наличии</option>
            <option value="false" ${query.inStock === 'false' ? 'selected' : ''}>Под заказ</option>
          </select>
        </div>
        <div class="filter-row filter-actions">
          <select name="sort">
            <option value="newest" ${query.sort === 'newest' ? 'selected' : ''}>Новинки</option>
            <option value="price_asc" ${query.sort === 'price_asc' ? 'selected' : ''}>Сначала дешевле</option>
            <option value="price_desc" ${query.sort === 'price_desc' ? 'selected' : ''}>Сначала дороже</option>
            <option value="in_stock" ${query.sort === 'in_stock' ? 'selected' : ''}>В наличии</option>
          </select>
          <button class="button button-primary" type="submit">Показать</button>
        </div>
      </form>
      <div class="catalog-summary" data-catalog-summary></div>
    </section>
    <section class="section">
      <div class="grid grid-4" data-product-grid></div>
    </section>
  `;

  setAppContent(page);

  const filterForm = page.querySelector('[data-filter-form]');
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(filterForm);
    const values = Object.fromEntries(data.entries());
    navigate(buildUrl('/catalog', values));
  });

  const grid = page.querySelector('[data-product-grid]');
  const summary = page.querySelector('[data-catalog-summary]');
  summary.appendChild(renderLoading('Загружаем каталог...'));

  try {
    const response = await api.fetchProducts({ ...query, limit: 24, page: 1 });
    summary.innerHTML = `<p class="catalog-summary-text">Найдено ${response.total} товаров</p>`;
    if (!response.items.length) {
      grid.appendChild(renderEmptyState('Товары не найдены', 'Попробуйте убрать фильтры или отправьте фото менеджеру.', 'Подобрать деталь', '/selection'));
    } else {
      response.items.forEach((product) => grid.appendChild(renderProductCard(product)));
    }
  } catch (error) {
    grid.appendChild(renderEmptyState('Ошибка каталога', 'Не удалось загрузить товары. Попробуйте позже.', 'Перезагрузить страницу', '/catalog'));
  }
};

const renderCategory = async ({ params }) => {
  const slug = params[1];
  setPageTitle(`Категория ${slug} - купить в Алматы`);
  addAnalytics({ eventType: 'category_view', categoryId: slug, source: 'frontend' });

  const page = document.createElement('div');
  page.appendChild(renderLoading('Загружаем категорию...'));
  setAppContent(page);

  try {
    const response = await api.fetchCategory(slug);
    const section = document.createElement('section');
    section.className = 'section';
    section.innerHTML = `
      <div class="section-heading">
        <span class="kicker">${response.category.title}</span>
        <h2>${response.category.title} - купить в Алматы</h2>
        <p>${response.category.description}</p>
      </div>
      <div class="grid grid-4" data-product-grid></div>
      <div class="section-footer">
        <a class="button button-primary" data-link href="${getRouteHref('/selection')}">Не нашли нужную деталь?</a>
      </div>
    `;
    const grid = section.querySelector('[data-product-grid]');
    if (!response.products.length) {
      grid.appendChild(renderEmptyState('Товаров нет', 'В этой категории пока нет доступных товаров.', 'Запросить подбор', '/selection'));
    } else {
      response.products.forEach((product) => grid.appendChild(renderProductCard(product)));
    }
    setAppContent(section);
  } catch (error) {
    setAppContent(renderEmptyState('Категория не найдена', 'Попробуйте вернуться в каталог.', 'В каталог', '/catalog'));
  }
};

const renderProduct = async ({ params }) => {
  const slug = params[1];
  setPageTitle(`${slug} - купить в Алматы`);
  addAnalytics({ eventType: 'product_view', productId: slug, source: 'frontend' });

  const page = document.createElement('div');
  page.appendChild(renderLoading('Загружаем товар...'));
  setAppContent(page);

  try {
    const response = await api.fetchProduct(slug);
    const product = response.product;
    const section = document.createElement('section');
    section.className = 'section product-page';
    section.innerHTML = `
      <div class="product-header">
        <div class="product-image" style="background-image:url('${getImageUrl(product.images?.[0], 'Фото нет', 520, 360)}')"></div>
        <div class="product-details">
          <span class="badge ${product.inStock ? 'badge-success' : 'badge-warning'}">${product.inStock ? 'В наличии' : 'Под заказ'}</span>
          <h1>${product.title}</h1>
          <p class="product-subtitle">SKU ${product.sku} · ${product.size || product.applianceType || 'универсально'}</p>
          <div class="product-price-large">
            <strong>${formatPrice(product.price)}</strong>
            ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ''}
          </div>
          <div class="product-actions product-actions-row">
            <button class="button button-primary" data-add-product="${product.id}">В корзину</button>
            <a class="button button-secondary" href="https://wa.me/77001234567" target="_blank">WhatsApp</a>
          </div>
          <div class="product-actions product-actions-row">
            <a data-link href="${getRouteHref('/selection')}" class="button button-ghost">Подобрать аналог</a>
            <a data-link href="${getRouteHref('/assistant')}" class="button button-ghost">Задать вопрос AI</a>
          </div>
        </div>
      </div>
      <div class="product-info-grid">
        <article class="product-info-card">
          <h3>Описание</h3>
          <p>${product.description}</p>
        </article>
        <article class="product-info-card">
          <h3>Характеристики</h3>
          <ul class="spec-list">
            ${Object.entries(product.specs || {}).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join('')}
          </ul>
          <p><strong>Совместимость:</strong> ${product.compatibility?.join(', ') || 'Универсально'}</p>
        </article>
      </div>
      <section class="section sub-section">
        <div class="section-heading">
          <span class="kicker">Похожие товары</span>
          <h2>Аналоги и сопутствующие детали</h2>
        </div>
        <div class="grid grid-4" data-analogs-grid></div>
      </section>
    `;

    section.querySelector('[data-add-product]').addEventListener('click', async () => {
      await handleAddToCart(product.id);
    });

    const analogsGrid = section.querySelector('[data-analogs-grid]');
    const analogs = product.analogs || [];
    if (!analogs.length) {
      analogsGrid.appendChild(renderEmptyState('Нет аналогов', 'Попробуйте подобрать деталь через менеджера.', 'Подбор детали', '/selection'));
    } else {
      analogs.forEach((analog) => analogsGrid.appendChild(renderProductCard(analog)));
    }

    setAppContent(section);
  } catch (error) {
    setAppContent(renderEmptyState('Товар не найден', 'Проверьте URL или вернитесь в каталог.', 'В каталог', '/catalog'));
  }
};

const renderCart = async () => {
  await refreshCart();
  setPageTitle('Корзина');
  addAnalytics({ eventType: 'cart_view', source: 'frontend' });

  const cart = cartStore.getCart();
  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Корзина</span>
      <h2>Соберите заказ для подтверждения менеджером</h2>
      <p>В корзине пока нет оплаты — менеджер свяжется и подтвердит наличие.</p>
    </div>
    <div class="cart-grid">
      <div class="cart-items" data-cart-items></div>
      <aside class="cart-summary-card">
        <h3>Итого</h3>
        <div class="order-summary">
          <div><span>Товаров</span><strong>${cart.itemCount}</strong></div>
          <div><span>Сумма</span><strong>${formatPrice(cart.totalAmount)}</strong></div>
        </div>
        <form class="checkout-form" data-order-form>
          <label>Имя<input name="customerName" type="text" placeholder="Ваше имя" required /></label>
          <label>Телефон<input name="phone" type="tel" placeholder="+7 700 123 45 67" required /></label>
          <label>Город<input name="city" type="text" placeholder="Алматы" /></label>
          <label>Способ связи
            <select name="contactMethod">
              <option value="phone">Звонок</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
            </select>
          </label>
          <label>Способ получения
            <select name="deliveryMethod">
              <option value="pickup">Самовывоз</option>
              <option value="delivery">Доставка</option>
              <option value="manager">Уточнить у менеджера</option>
            </select>
          </label>
          <label>Комментарий<textarea name="comment" placeholder="Дополните информацию или укажите модель техники"></textarea></label>
          <button class="button button-primary" type="submit">Оформить заказ без оплаты</button>
          <p class="form-note">Менеджер подтвердит наличие и стоимость перед оплатой.</p>
        </form>
      </aside>
    </div>
  `;

  setAppContent(section);

  const itemsContainer = section.querySelector('[data-cart-items]');
  if (!cart.items.length) {
    itemsContainer.appendChild(renderEmptyState('Корзина пуста', 'Добавьте товары из каталога или попросите нас подобрать нужную деталь.', 'Перейти в каталог', '/catalog'));
  } else {
    cart.items.forEach((item) => {
      const itemCard = document.createElement('article');
      itemCard.className = 'cart-item';
      itemCard.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-image" style="background-image:url('${getImageUrl(item.image, 'Фото', 160, 120)}')"></div>
          <div>
            <h4>${item.title}</h4>
            <p>${item.sku}</p>
            <p>${formatPrice(item.price)} × ${item.quantity} = ${formatPrice(item.subtotal)}</p>
          </div>
        </div>
        <div class="cart-item-actions">
          <div class="cart-item-controls" aria-label="Количество товара">
            <button class="button button-sm button-ghost quantity-button" data-action="decrease" data-id="${item.id}" aria-label="Уменьшить количество">-</button>
            <span class="cart-item-quantity">${item.quantity}</span>
            <button class="button button-sm button-ghost quantity-button" data-action="increase" data-id="${item.id}" aria-label="Увеличить количество">+</button>
          </div>
          <button class="button button-sm cart-remove-button" data-action="remove" data-id="${item.id}">Удалить</button>
        </div>
      `;
      itemsContainer.appendChild(itemCard);
    });

    itemsContainer.addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const action = button.dataset.action;
      const itemId = button.dataset.id;
      if (action === 'decrease') {
        const item = cart.items.find((item) => item.id === itemId);
        if (item && item.quantity > 1) {
          await cartStore.updateItem(itemId, item.quantity - 1);
          await refreshCart();
          renderCart();
        }
      }
      if (action === 'increase') {
        const item = cart.items.find((item) => item.id === itemId);
        if (item) {
          await cartStore.updateItem(itemId, item.quantity + 1);
          await refreshCart();
          renderCart();
        }
      }
      if (action === 'remove') {
        await cartStore.removeItem(itemId);
        await refreshCart();
        renderCart();
      }
    });
  }

  section.querySelector('[data-order-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!cart.items.length) return;
    const form = event.target;
    const formData = new FormData(form);
    const payload = {
      sessionId: cartStore.getSessionId(),
      customerName: formData.get('customerName'),
      phone: formData.get('phone'),
      city: formData.get('city'),
      contactMethod: formData.get('contactMethod'),
      deliveryMethod: formData.get('deliveryMethod'),
      comment: formData.get('comment'),
      items: cart.items.map((item) => ({
        productId: item.productId,
        title: item.title,
        sku: item.sku,
        price: item.price,
        quantity: item.quantity,
      })),
      totalAmount: cart.totalAmount,
      source: 'shop',
      sourcePage: '/cart',
    };

    try {
      const response = await api.submitOrder(payload);
      addAnalytics({ eventType: 'order_created', orderId: response.order.id, source: 'frontend' });
      setAppContent(renderOrderSuccess(response.order));
      cartStore.setCart({ items: [], totalAmount: 0, itemCount: 0 });
      updateCartBadge();
    } catch (error) {
      const errorCard = renderEmptyState('Не удалось оформить заказ', error.message, 'Попробовать снова', '/cart');
      setAppContent(errorCard);
    }
  });
};

const renderOrderSuccess = (order) => {
  const section = document.createElement('section');
  section.className = 'section success-panel';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Заказ оформлен</span>
      <h2>Спасибо! Менеджер подтвердит наличие и цену.</h2>
      <p>Мы получили заказ №${order.id}. Ожидайте звонка или сообщение в выбранный канал.</p>
    </div>
    <div class="success-actions">
      <a class="button button-primary" href="https://wa.me/77001234567" target="_blank">Написать в WhatsApp</a>
      <a class="button button-secondary" data-link href="${getRouteHref('/catalog')}">Продолжить покупки</a>
    </div>
  `;
  return section;
};

const renderSearch = async () => {
  const query = getQueryParams();
  const searchTerm = query.q || '';
  setPageTitle(searchTerm ? `Поиск: ${searchTerm}` : 'Поиск деталей');
  addAnalytics({ eventType: 'search_used', searchQuery: searchTerm, source: 'frontend' });

  const page = document.createElement('div');
  page.innerHTML = `
    <section class="section">
      <div class="section-heading">
        <span class="kicker">Поиск</span>
        <h2>Найдите деталь по артикулу, размеру или модели техники</h2>
      </div>
      <form class="search-form" data-search-form>
        <input name="q" type="search" placeholder="Введите артикул, размер или модель" value="${searchTerm}" />
        <button class="button button-primary" type="submit">Искать</button>
      </form>
      <div class="grid grid-4" data-search-grid></div>
    </section>
  `;
  setAppContent(page);

  const grid = page.querySelector('[data-search-grid]');
  page.querySelector('[data-search-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = event.target.q.value.trim();
    navigate(buildUrl('/search', { q: value }));
  });

  if (!searchTerm) {
    grid.appendChild(renderEmptyState('Начните поиск', 'Введите артикул, размер или модель техники.', 'Перейти в каталог', '/catalog'));
    return;
  }

  grid.appendChild(renderLoading('Ищем детали...'));
  try {
    const response = await api.fetchProducts({ search: searchTerm, limit: 24 });
    grid.innerHTML = '';
    if (!response.items.length) {
      grid.appendChild(renderEmptyState('Мы ничего не нашли', 'Попробуйте другой запрос или напишите менеджеру - подберем аналог.', 'Написать менеджеру', '/selection'));
    } else {
      response.items.forEach((product) => grid.appendChild(renderProductCard(product)));
    }
  } catch (error) {
    grid.innerHTML = '';
    grid.appendChild(renderEmptyState('Ошибка поиска', 'Не удалось загрузить результаты. Проверьте соединение.', 'Попробовать снова', `/search?q=${encodeURIComponent(searchTerm)}`));
  }
};

const renderAssistant = () => {
  setPageTitle('AI-помощник');
  addAnalytics({ eventType: 'assistant_opened', source: 'frontend' });

  const messages = [
    { role: 'assistant', text: 'Я помогу подобрать деталь по артикулу, размеру или модели техники.' },
  ];

  const section = document.createElement('section');
  section.className = 'section assistant-section';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">AI-помощник</span>
      <h2>Быстрая консультация по подбору запчастей</h2>
    </div>
    <div class="assistant-panel">
      <div class="assistant-messages" data-assistant-messages></div>
      <div class="assistant-actions">
        <button class="button button-secondary" data-suggestion="Нужен сальник по размеру">Нужен сальник по размеру</button>
        <button class="button button-secondary" data-suggestion="Подобрать по модели техники">Подобрать по модели техники</button>
        <button class="button button-secondary" data-suggestion="Найти аналог">Найти аналог</button>
      </div>
      <form class="assistant-form" data-assistant-form>
        <input name="question" type="text" placeholder="Опишите вашу задачу" autocomplete="off" required />
        <button class="button button-primary" type="submit">Спросить AI</button>
      </form>
      <div class="assistant-footer">
        <a class="button button-ghost" href="https://wa.me/77001234567" target="_blank">Передать менеджеру</a>
      </div>
    </div>
  `;

  const messagesContainer = section.querySelector('[data-assistant-messages]');
  const form = section.querySelector('[data-assistant-form]');

  const renderMessages = () => {
    messagesContainer.innerHTML = messages.map((item) => `
      <div class="assistant-message ${item.role}">
        <div class="assistant-bubble">
          <p>${item.text}</p>
        </div>
      </div>
    `).join('');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const sendQuestion = async (question) => {
    if (!question) return;
    messages.push({ role: 'user', text: question });
    renderMessages();
    addAnalytics({ eventType: 'assistant_message_sent', source: 'frontend', meta: { question } });
    messages.push({ role: 'assistant', text: 'Ищу подходящий вариант...' });
    renderMessages();

    try {
      const response = await api.askShopAssistant(question);
      messages.pop();
      messages.push({ role: 'assistant', text: response.answer });
      renderMessages();
    } catch (error) {
      messages.pop();
      messages.push({ role: 'assistant', text: 'Не удалось получить ответ. Попробуйте позже или напишите менеджеру.' });
      renderMessages();
    }
  };

  section.querySelectorAll('[data-suggestion]').forEach((button) => {
    button.addEventListener('click', async () => {
      await sendQuestion(button.dataset.suggestion);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = event.target.question.value.trim();
    if (!value) return;
    event.target.question.value = '';
    await sendQuestion(value);
  });

  setAppContent(section);
  renderMessages();
};

const renderSelection = () => {
  setPageTitle('Подбор детали');
  addAnalytics({ eventType: 'selection_form_submitted', source: 'frontend' });

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Подбор детали</span>
      <h2>Расскажите, что нужно найти</h2>
      <p>Мы подберем подходящий размер, модель или аналог быстро через менеджера.</p>
    </div>
    <form class="selection-form" data-selection-form>
      <label>Имя<input name="name" type="text" placeholder="Ваше имя" required /></label>
      <label>Телефон<input name="phone" type="tel" placeholder="+7 700 123 45 67" required /></label>
      <label>Модель техники<input name="applianceModel" type="text" placeholder="Например: Samsung WW80" /></label>
      <label>Размер детали<input name="partSize" type="text" placeholder="Например: 35x62x10" /></label>
      <label>Что нужно найти<textarea name="message" placeholder="Опишите деталь или проблему" required></textarea></label>
      <label>Комментарий<textarea name="comment" placeholder="Дополнительные детали"></textarea></label>
      <div class="selection-actions">
        <button class="button button-primary" type="submit">Отправить запрос</button>
        <a class="button button-secondary" href="https://wa.me/77001234567" target="_blank">WhatsApp</a>
      </div>
    </form>
  `;

  section.querySelector('[data-selection-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      applianceModel: formData.get('applianceModel'),
      partSize: formData.get('partSize'),
      message: formData.get('message'),
      comment: formData.get('comment'),
    };

    try {
      const response = await api.submitSelectionRequest(payload);
      addAnalytics({ eventType: 'selection_form_submitted', source: 'frontend' });
      setAppContent(renderSelectionSuccess());
    } catch (error) {
      setAppContent(renderEmptyState('Ошибка запроса', error.message || 'Не удалось отправить заявку.', 'Попробовать снова', '/selection'));
    }
  });

  setAppContent(section);
};

const renderSelectionSuccess = () => {
  const section = document.createElement('section');
  section.className = 'section success-panel';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Запрос принят</span>
      <h2>Мы передали задачу менеджеру</h2>
      <p>Ожидайте сообщение или звонок в ближайшее время. Если нужно, напишите менеджеру сразу.</p>
    </div>
    <div class="success-actions">
      <a class="button button-primary" href="https://wa.me/77001234567" target="_blank">Написать в WhatsApp</a>
      <a class="button button-secondary" data-link href="${getRouteHref('/catalog')}">Перейти в каталог</a>
    </div>
  `;
  return section;
};

const renderContacts = () => {
  setPageTitle('Контакты');
  addAnalytics({ eventType: 'contacts_view', source: 'frontend' });

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Контакты</span>
      <h2>Свяжитесь с нами любым удобным способом</h2>
      <p>Адрес, контактные номера и рабочие часы для быстрого заказа.</p>
    </div>
    <div class="grid grid-2 contact-grid">
      <div class="contact-card">
        <h3>Адрес</h3>
        <p>Алматы, центр города</p>
        <p>Ул. Примерная 12, торговый цех</p>
      </div>
      <div class="contact-card">
        <h3>Связь</h3>
        <a href="tel:+77001234567">+7 700 123 45 67</a>
        <a href="https://wa.me/77001234567" target="_blank">WhatsApp</a>
        <a href="https://t.me/your_telegram" target="_blank">Telegram</a>
      </div>
      <div class="contact-card">
        <h3>График работы</h3>
        <p>Пн–Пт: 09:00–19:00</p>
        <p>Сб: 10:00–16:00</p>
        <p>Вс: выходной</p>
      </div>
      <div class="contact-card map-card">
        <h3>Карта</h3>
        <div class="map-placeholder">Карта-заглушка</div>
      </div>
    </div>
  `;
  setAppContent(section);
};

const renderHowToOrder = () => {
  setPageTitle('Как заказать');
  addAnalytics({ eventType: 'how_to_order_view', source: 'frontend' });

  const section = document.createElement('section');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-heading">
      <span class="kicker">Как заказать</span>
      <h2>Пять шагов до подтвержденного заказа</h2>
    </div>
    <div class="grid grid-5 steps-grid">
      <article class="step-card"><strong>1</strong><p>Найдите товар или запросите подбор.</p></article>
      <article class="step-card"><strong>2</strong><p>Добавьте в корзину или оставьте запрос.</p></article>
      <article class="step-card"><strong>3</strong><p>Отправьте контактные данные.</p></article>
      <article class="step-card"><strong>4</strong><p>Менеджер уточнит наличие и цену.</p></article>
      <article class="step-card"><strong>5</strong><p>Получите самовывоз или доставку.</p></article>
    </div>
  `;
  setAppContent(section);
};

const renderNotFound = () => {
  setPageTitle('Страница не найдена');
  const element = renderEmptyState('Страница не найдена', 'Похоже, такой страницы нет.', 'Вернуться на главную', '/');
  setAppContent(element);
};

const renderAdminModal = () => {
  const body = document.querySelector('[data-admin-modal-body]');
  if (!body) return;

  body.innerHTML = `
    <div class="admin-panel">
      <div class="admin-card">
        <h3>Админка активирована</h3>
        <p>Панель открывается как модальное окно. Здесь можно расширить интерфейс управления товарами, категориями и заказами.</p>
      </div>
      <div class="admin-card">
        <h3>Загруженные категории</h3>
        <p>На данный момент в приложении загружено <strong>${state.categories.length}</strong> категорий.</p>
        ${state.categories.length ? `<ul>${state.categories.map((category) => `<li>${category.title}</li>`).join('')}</ul>` : '<p>Категории ещё не загружены.</p>'}
      </div>
      <div class="admin-card">
        <h3>Статус интеграции</h3>
        <p>Backend-админка доступна через API-пути <code>/api/admin/shop/*</code>. Для работы нужен валидный ключ администратора.</p>
      </div>
    </div>
  `;
};

const renderAdmin = () => {
  setPageTitle('Админ-панель');
  renderAdminModal();
};

routeDefinitions = [
  { pattern: /^\/$/, title: 'Мир Сальников - магазин запчастей', action: renderHome },
  { pattern: /^\/catalog\/?$/, title: 'Каталог запчастей', action: renderCatalog },
  { pattern: /^\/catalog\/([^/]+)\/?$/, title: 'Категория', action: renderCategory },
  { pattern: /^\/product\/([^/]+)\/?$/, title: 'Товар', action: renderProduct },
  { pattern: /^\/cart\/?$/, title: 'Корзина', action: renderCart },
  { pattern: /^\/search\/?$/, title: 'Поиск', action: renderSearch },
  { pattern: /^\/assistant\/?$/, title: 'AI-помощник', action: renderAssistant },
  { pattern: /^\/selection\/?$/, title: 'Подбор детали', action: renderSelection },
  { pattern: /^\/contacts\/?$/, title: 'Контакты', action: renderContacts },
  { pattern: /^\/how-to-order\/?$/, title: 'Как заказать', action: renderHowToOrder },
  { pattern: /^\/admin\/?$/, title: 'Админ-панель', action: renderAdmin },
];

const navigate = (path, options = {}) => {
  const route = path.startsWith('#') ? path : `#${path}`;
  if (window.location.hash !== route) {
    if (options.replace) {
      window.history.replaceState({}, '', route);
    } else {
      window.history.pushState({}, '', route);
    }
  }
  renderRoute();
};

const handleLinkClick = (event) => {
  const anchor = event.target.closest('[data-link]');
  if (!anchor) return;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('mailto:')) return;
  event.preventDefault();
  navigate(href);
};

const matchRoute = (path) => {
  for (const route of routeDefinitions) {
    const match = path.match(route.pattern);
    if (match) return { route, params: match };
  }
  return null;
};

const renderRoute = () => {
  const path = getCurrentPath();
  const match = matchRoute(path);
  renderHeader();
  setAdminModalOpen(path === '/admin');
  if (!match) {
    renderNotFound();
    return;
  }
  const query = getQueryParams();
  match.route.action({ params: match.params, query });
  updateCartBadge();
};

const handleAddToCart = async (productId) => {
  try {
    await cartStore.addToCart(productId, 1);
    state.currentCart = cartStore.getCart();
    updateCartBadge();
    showToast('Товар добавлен в корзину');
    addAnalytics({ eventType: 'add_to_cart', productId, source: 'frontend' });
  } catch (error) {
    showToast(error.message || 'Не удалось добавить товар', 'error');
  }
};

const showToast = (message, type = 'success') => {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
};

const refreshCart = async () => {
  try {
    const cart = await cartStore.initCart();
    state.currentCart = cart;
  } catch (error) {
    console.warn('[cart.refresh]', error.message);
  }
};

const initRouter = () => {
  window.addEventListener('popstate', renderRoute);
  document.body.addEventListener('click', handleLinkClick);
};

export const initApp = async () => {
  renderShell();
  initRouter();
  try {
    const categoriesResponse = await api.fetchCategories();
    state.categories = categoriesResponse.items || [];
  } catch (error) {
    state.categories = [];
  }

  await refreshCart();
  updateCartBadge();
  renderRoute();
};
