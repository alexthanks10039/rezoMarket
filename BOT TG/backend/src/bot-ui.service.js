import { employees } from './employees.store.js';
import { getAllLeads, getLeadStats, getLeadsByStatus, LEAD_STATUSES, statusLabels } from './leads.store.js';

const miniAppUrl = process.env.MINI_APP_URL || '';

export const normalizePhoneForLink = (phone = '') => String(phone).replace(/[^\d+]/g, '');

export const buildMainMenuText = () => [
  'Главное меню Мир Сальников',
  '',
  'Выберите раздел:',
].join('\n');

export const mainMenuKeyboard = () => ({
  inline_keyboard: [
    [
      { text: '🆕 Новые заявки', callback_data: 'menu:leads:new' },
      { text: '🛠 В работе', callback_data: 'menu:leads:in_work' },
    ],
    [
      { text: '📊 Статистика', callback_data: 'menu:stats' },
      { text: '👷 Сотрудники', callback_data: 'menu:employees' },
    ],
    [
      miniAppUrl
        ? { text: '📱 Mini App', web_app: { url: miniAppUrl } }
        : { text: '📱 Mini App', callback_data: 'menu:mini_app' },
      { text: '⚙️ Настройки', callback_data: 'menu:settings' },
    ],
  ],
});

export const persistentNavigationKeyboard = () => ({
  keyboard: [
    [{ text: 'Главное меню' }, { text: 'Статистика' }],
    [{ text: 'Мини-Эпп' }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
});

export const leadActionKeyboard = (lead) => {
  const phone = normalizePhoneForLink(lead.phone);
  const whatsappPhone = phone.replace(/^\+/, '');

  return {
    inline_keyboard: [
      [
        { text: '🛠 Взять в работу', callback_data: `lead:take:${lead.id}` },
        { text: '👷 Передать', callback_data: `lead:reassign:${lead.id}` },
    ],
    [
      { text: '💬 WhatsApp', url: `https://wa.me/${whatsappPhone}` },
      { text: '📞 Позвонить', callback_data: `lead:call:${lead.id}` },
    ],
      [
        { text: '📊 Статистика', callback_data: 'menu:stats' },
        { text: '🏠 Главное меню', callback_data: 'menu:main' },
      ],
      [
        miniAppUrl
          ? { text: '📱 Mini App', web_app: { url: miniAppUrl } }
          : { text: '📱 Mini App', callback_data: 'menu:mini_app' },
      ],
    ],
  };
};

export const buildLeadMessage = (lead) => {
  const lines = ['🆕 Новая заявка с сайта', ''];

  lines.push(`👤 Имя: ${lead.name || 'Не указано'}`);
  lines.push(`📞 Телефон: ${lead.phone || 'Не указан'}`);
  if (lead.service) lines.push(`🛠 Услуга: ${lead.service}`);
  if (lead.objectType) lines.push(`🏠 Объект: ${lead.objectType}`);
  if (lead.address) lines.push(`📍 Адрес / район: ${lead.address}`);

  if (lead.calculatedPrice) {
    lines.push(`💰 Расчёт: ${Number(lead.calculatedPrice).toLocaleString('ru-RU')} ₸`);
  }

  if (lead.comment) {
    lines.push('');
    lines.push('💬 Комментарий:');
    lines.push(lead.comment);
  }

  lines.push('');
  lines.push(`🌐 Источник: ${lead.source || 'сайт'}`);
  if (lead.sourcePage) lines.push(`📄 Страница: ${lead.sourcePage}`);
  lines.push(`📌 Статус: ${statusLabels[lead.status] || lead.status}`);
  lines.push(`🕒 Время: ${new Date(lead.createdAt || Date.now()).toLocaleString('ru-RU')}`);

  if (lead.assignedTo?.name) {
    lines.push(`👷 Ответственный: ${lead.assignedTo.name}`);
  }

  return lines.join('\n');
};

export const buildStatsMessage = () => {
  const stats = getLeadStats();

  return [
    '📊 Статистика заявок',
    '',
    `Всего заявок: ${stats.total}`,
    `Новые: ${stats.new}`,
    `В работе: ${stats.inWork}`,
    `Выполненные: ${stats.done}`,
    `Переназначенные: ${stats.reassigned}`,
    `Отменённые: ${stats.cancelled}`,
  ].join('\n');
};

export const buildLeadsListMessage = (status) => {
  const leads = status ? getLeadsByStatus(status) : getAllLeads();
  const title = status ? `Заявки: ${statusLabels[status] || status}` : 'Все заявки';

  if (leads.length === 0) {
    return `${title}\n\nПока пусто.`;
  }

  return [
    title,
    '',
    ...leads.slice(0, 10).map((lead, index) => {
      const label = statusLabels[lead.status] || lead.status;
      return `${index + 1}. ${lead.name} - ${lead.phone}\n   ${lead.service || 'Услуга не указана'} · ${label}`;
    }),
  ].join('\n');
};

export const leadsListKeyboard = (status) => {
  const leads = status ? getLeadsByStatus(status) : getAllLeads();
  const rows = leads.slice(0, 10).map((lead) => [
    { text: `Открыть ${lead.name}`, callback_data: `lead:open:${lead.id}` },
  ]);

  rows.push([{ text: '🏠 Главное меню', callback_data: 'menu:main' }]);

  return { inline_keyboard: rows };
};

export const employeesListMessage = () => [
  '👷 Сотрудники',
  '',
  ...employees.map((employee, index) => `${index + 1}. ${employee.name} - ${employee.role} · ${employee.status}`),
].join('\n');

export const employeesKeyboard = (leadId = null) => ({
  inline_keyboard: [
    ...employees.map((employee) => [
      {
        text: `${employee.name} - ${employee.status}`,
        callback_data: leadId ? `lead:assign:${leadId}:${employee.id}` : `employee:open:${employee.id}`,
      },
    ]),
    [{ text: '🏠 Главное меню', callback_data: 'menu:main' }],
  ],
});

export const miniAppMessage = () => [
  '📱 Mini App',
  '',
  miniAppUrl
    ? 'Mini App готов к открытию.'
    : 'Mini App пока не подключён. После деплоя нужно добавить MINI_APP_URL в переменные окружения.',
].join('\n');

export const settingsMessage = () => [
  '⚙️ Настройки',
  '',
  'Сейчас доступны базовые настройки через переменные окружения:',
  '- TG_KEY',
  '- OWNER_ID',
  '- MINI_APP_URL',
  '',
  'Расширенные настройки добавим после подключения базы данных.',
].join('\n');

export const statusMenuKeyboard = (leadId) => ({
  inline_keyboard: [
    [{ text: '🆕 Новая', callback_data: `lead:status:${leadId}:${LEAD_STATUSES.NEW}` }],
    [{ text: '🛠 В работе', callback_data: `lead:status:${leadId}:${LEAD_STATUSES.IN_WORK}` }],
    [{ text: '✅ Выполнена', callback_data: `lead:status:${leadId}:${LEAD_STATUSES.DONE}` }],
    [{ text: '❌ Отменена', callback_data: `lead:status:${leadId}:${LEAD_STATUSES.CANCELLED}` }],
    [{ text: '🏠 Главное меню', callback_data: 'menu:main' }],
  ],
});

