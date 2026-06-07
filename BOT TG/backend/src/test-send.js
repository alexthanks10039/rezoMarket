import 'dotenv/config';
import { sendOwnerLeadNotification } from './telegram.service.js';

const testLead = {
  id: `test_${Date.now()}`,
  name: 'Александр',
  phone: '+7 777 000 00 00',
  service: 'Магазин Мир Сальников',
  objectType: 'Подбор сальника',
  address: 'Алматы',
  comment: 'Тестовая заявка на подбор детали из BOT TG backend.',
  calculatorData: {
    category: 'Сальники',
    size: '35x62x10',
    applianceType: 'Стиральная машина',
    items: [
      { sku: 'SL-356210-NBR', title: 'Сальник 35x62x10 NBR', quantity: 1, subtotal: 2300 },
    ],
  },
  calculatedPrice: 2300,
  source: 'smoke-test',
  sourcePage: '/selection',
};

try {
  const result = await sendOwnerLeadNotification(testLead);
  console.log('[telegram.test] sent', {
    ok: result.ok,
    messageId: result.result?.message_id,
    chatId: result.result?.chat?.id,
  });
} catch (error) {
  console.error('[telegram.test] failed', error.message);
  process.exit(1);
}
