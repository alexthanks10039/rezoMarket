import { Router } from 'express';

export const ragRouter = Router();

const buildShopAnswer = (question) => {
  const prompt = String(question || '').trim().toLowerCase();
  const suggestions = [
    'Нужен сальник 35x62x10',
    'Подобрать подшипники по модели',
    'Найти аналог ремня',
    'Уточнить наличие на складе',
    'Передать запрос менеджеру',
  ];

  if (!prompt) {
    return {
      answer: 'Опишите, что нужно подобрать: артикул, размер детали или модель техники.',
      suggestions,
    };
  }

  if (prompt.includes('артикул') || prompt.match(/\d{2,}/)) {
    return {
      answer: 'Напишите артикул или размер детали, и я помогу найти подходящий компонент или аналог.',
      suggestions,
    };
  }

  if (prompt.includes('наличие') || prompt.includes('есть')) {
    return {
      answer: 'Я вижу, что вы хотите уточнить наличие. Я помогу собрать запрос менеджеру и предложу ближайший аналог.',
      suggestions,
    };
  }

  if (prompt.includes('аналог') || prompt.includes('подобрать')) {
    return {
      answer: 'Подберу аналог на основе размера, модели техники или типа детали. Напишите, что именно нужно заменить.',
      suggestions,
    };
  }

  return {
    answer: 'Я помогу подобрать подходящую деталь, но окончательное подтверждение оставьте менеджеру. Опишите модель техники, артикул или размер.',
    suggestions,
  };
};

ragRouter.post('/api/rag/ask', (req, res) => {
  const body = req.body || {};
  const question = String(body.question || '').trim();
  const context = String(body.context || '').trim().toLowerCase();

  if (!question) {
    return res.status(400).json({ success: false, message: 'Question is required' });
  }

  if (context !== 'shop') {
    return res.json({
      success: true,
      answer: 'Я помогу с подбором деталей, если вы зададите вопрос в контексте магазина. Попробуйте описать модель техники или размер детали.',
      suggestions: [
        'Нужен сальник по размеру',
        'Подобрать по модели стиральной машины',
        'Найти аналог подшипника или ремня',
      ],
      context: 'shop',
    });
  }

  const response = buildShopAnswer(question);

  return res.json({
    success: true,
    answer: response.answer,
    suggestions: response.suggestions,
    warning: 'Я могу помочь подобрать варианты, но точную совместимость лучше подтвердить менеджеру.',
  });
});
