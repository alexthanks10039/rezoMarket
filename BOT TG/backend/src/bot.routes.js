import { Router } from 'express';
import {
  answerCallbackQuery,
  editMessage,
  getBotInfo,
  getWebhookInfo,
  sendMessage,
} from './telegram.service.js';
import {
  buildLeadMessage,
  buildLeadsListMessage,
  buildMainMenuText,
  buildStatsMessage,
  employeesKeyboard,
  employeesListMessage,
  leadActionKeyboard,
  leadsListKeyboard,
  mainMenuKeyboard,
  miniAppMessage,
  persistentNavigationKeyboard,
  settingsMessage,
  statusMenuKeyboard,
} from './bot-ui.service.js';
import {
  getLeadById,
  LEAD_STATUSES,
  reassignLead,
  updateLeadStatus,
} from './leads.store.js';
import { getEmployeeById } from './employees.store.js';
import {
  ACCESS_MODE,
  isOwnerTelegramUser,
  requireOwnerAccess,
} from './owner-access.js';

export const botRouter = Router();

const ownerDeniedResponse = {
  ok: false,
  success: false,
  accessMode: ACCESS_MODE,
  message: 'Owner access required',
};

const sendMainMenu = async (chatId) => {
  await sendMessage({
    chatId,
    text: buildMainMenuText(),
    replyMarkup: mainMenuKeyboard(),
  });
};

const sendReload = async (chatId) => {
  await sendMessage({
    chatId,
    text: 'Бот обновлён. Главное меню и клавиатура перезапущены.',
    replyMarkup: persistentNavigationKeyboard(),
  });
  await sendMainMenu(chatId);
};

const safeEditOrSend = async ({ chatId, messageId, text, replyMarkup }) => {
  if (messageId) {
    try {
      await editMessage({ chatId, messageId, text, replyMarkup });
      return;
    } catch (error) {
      console.warn('[bot.edit_failed]', error.message);
    }
  }

  await sendMessage({ chatId, text, replyMarkup });
};

const handleMenuCallback = async ({ data, chatId, messageId }) => {
  if (data === 'menu:main') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: buildMainMenuText(),
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  if (data === 'menu:stats') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: buildStatsMessage(),
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  if (data === 'menu:employees') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: employeesListMessage(),
      replyMarkup: employeesKeyboard(),
    });
    return;
  }

  if (data === 'menu:mini_app') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: miniAppMessage(),
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  if (data === 'menu:settings') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: settingsMessage(),
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  if (data === 'menu:leads:new') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: buildLeadsListMessage(LEAD_STATUSES.NEW),
      replyMarkup: leadsListKeyboard(LEAD_STATUSES.NEW),
    });
    return;
  }

  if (data === 'menu:leads:in_work') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: buildLeadsListMessage(LEAD_STATUSES.IN_WORK),
      replyMarkup: leadsListKeyboard(LEAD_STATUSES.IN_WORK),
    });
  }
};

const handleLeadCallback = async ({ data, chatId, messageId, username }) => {
  const [, action, leadId, extra] = data.split(':');
  const lead = getLeadById(leadId);

  if (!lead) {
    await sendMessage({
      chatId,
      text: 'Заявка не найдена. Возможно, backend был перезапущен и временное хранилище очистилось.',
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  if (action === 'open') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: buildLeadMessage(lead),
      replyMarkup: leadActionKeyboard(lead),
    });
    return;
  }

  if (action === 'take') {
    const updatedLead = updateLeadStatus({
      leadId,
      status: LEAD_STATUSES.IN_WORK,
      by: username || 'telegram',
    });

    await safeEditOrSend({
      chatId,
      messageId,
      text: `${buildLeadMessage(updatedLead)}\n\n✅ Заявка взята в работу.`,
      replyMarkup: leadActionKeyboard(updatedLead),
    });
    return;
  }

  if (action === 'reassign') {
    await safeEditOrSend({
      chatId,
      messageId,
      text: 'Кому передать заявку?\n\nВыберите сотрудника из списка:',
      replyMarkup: employeesKeyboard(leadId),
    });
    return;
  }

  if (action === 'assign') {
    const employee = getEmployeeById(extra);

    if (!employee) {
      await sendMessage({
        chatId,
        text: 'Сотрудник не найден.',
        replyMarkup: mainMenuKeyboard(),
      });
      return;
    }

    const updatedLead = reassignLead({
      leadId,
      employeeId: employee.id,
      employeeName: employee.name,
      by: username || 'telegram',
    });

    await safeEditOrSend({
      chatId,
      messageId,
      text: `${buildLeadMessage(updatedLead)}\n\n✅ Заявка передана сотруднику: ${employee.name}.`,
      replyMarkup: leadActionKeyboard(updatedLead),
    });
    return;
  }

  if (action === 'status') {
    const updatedLead = updateLeadStatus({
      leadId,
      status: extra,
      by: username || 'telegram',
    });

    await safeEditOrSend({
      chatId,
      messageId,
      text: `${buildLeadMessage(updatedLead)}\n\n✅ Статус обновлён.`,
      replyMarkup: leadActionKeyboard(updatedLead),
    });
    return;
  }

  if (action === 'call') {
    await sendMessage({
      chatId,
      text: `Телефон клиента: ${lead.phone}\n\nНажмите на номер и выберите звонок.`,
      replyMarkup: mainMenuKeyboard(),
    });
  }
};

const handleTextMessage = async ({ chatId, text }) => {
  const normalized = String(text || '').trim().toLowerCase();

  if (normalized === '/reload' || normalized === 'reload' || normalized === 'перезапуск') {
    await sendReload(chatId);
    return;
  }

  if (normalized === '/start' || normalized === 'главное меню') {
    await sendMainMenu(chatId);
    return;
  }

  if (normalized === 'статистика') {
    await sendMessage({
      chatId,
      text: buildStatsMessage(),
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  if (normalized === 'мини-эпп' || normalized === 'mini app') {
    await sendMessage({
      chatId,
      text: miniAppMessage(),
      replyMarkup: mainMenuKeyboard(),
    });
    return;
  }

  await sendMessage({
    chatId,
    text: 'Не понял команду. Откройте главное меню и выберите действие.',
    replyMarkup: mainMenuKeyboard(),
  });
};

const answerDeniedCallback = async (callback) => {
  if (!callback?.id) {
    return;
  }

  try {
    await answerCallbackQuery({
      callbackQueryId: callback.id,
      text: 'Owner access required',
    });
  } catch (error) {
    console.warn('[telegram.owner_denied_answer_failed]', error.message);
  }
};

botRouter.get('/api/telegram/get-me', requireOwnerAccess, async (req, res) => {
  try {
    const data = await getBotInfo();
    return res.json({ ok: true, result: data.result });
  } catch (error) {
    console.error('[telegram.get_me_error]', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

botRouter.get('/api/telegram/webhook-info', requireOwnerAccess, async (req, res) => {
  try {
    const data = await getWebhookInfo();
    return res.json({ ok: true, result: data.result });
  } catch (error) {
    console.error('[telegram.webhook_info_error]', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

botRouter.post('/api/telegram/webhook', async (req, res) => {
  const update = req.body || {};

  try {
    if (update.callback_query) {
      const callback = update.callback_query;
      const data = callback.data || '';
      const chatId = callback.message?.chat?.id;
      const messageId = callback.message?.message_id;
      const username = callback.from?.username || callback.from?.first_name;

      if (!isOwnerTelegramUser(callback.from?.id)) {
        await answerDeniedCallback(callback);
        return res.status(403).json(ownerDeniedResponse);
      }

      await answerCallbackQuery({
        callbackQueryId: callback.id,
        text: 'Готово',
      });

      if (data.startsWith('menu:')) {
        await handleMenuCallback({ data, chatId, messageId });
      } else if (data.startsWith('lead:')) {
        await handleLeadCallback({ data, chatId, messageId, username });
      } else {
        await sendMessage({
          chatId,
          text: 'Действие пока не реализовано.',
          replyMarkup: mainMenuKeyboard(),
        });
      }

      return res.json({ ok: true });
    }

    if (update.message) {
      const chatId = update.message.chat?.id;
      const text = update.message.text || '';

      if (!isOwnerTelegramUser(update.message.from?.id)) {
        return res.status(403).json(ownerDeniedResponse);
      }

      await sendMessage({
        chatId,
        text: 'Клавиатура включена.',
        replyMarkup: persistentNavigationKeyboard(),
      });
      await handleTextMessage({ chatId, text });
      return res.json({ ok: true });
    }

    return res.json({ ok: true, skipped: true });
  } catch (error) {
    console.error('[telegram.webhook_error]', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});
