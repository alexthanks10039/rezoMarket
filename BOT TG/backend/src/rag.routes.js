import { Router } from 'express';
import * as shopStore from './shop/store.js';

export const ragRouter = Router();

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 12000);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

const withTimeout = async (promise, timeoutMs = AI_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const extractOpenAiText = (payload) => {
  if (payload?.output_text) return String(payload.output_text).trim();

  const output = payload?.output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' || content.type === 'text') {
        const text = content.text || content.content;
        if (text) return String(text).trim();
      }
    }
  }

  return '';
};

const extractGeminiText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('\n').trim();
};

const getProductContext = (question) => {
  const products = shopStore.listProducts({ search: question, page: 1, limit: 6 }).items;
  const fallbackProducts = products.length ? products : shopStore.listProducts({ page: 1, limit: 6, sort: 'in_stock' }).items;

  return fallbackProducts.map((product) => ({
    title: product.title,
    sku: product.sku,
    price: product.price,
    inStock: product.inStock,
    stockQty: product.stockQty,
    size: product.size,
    brand: product.brand,
    material: product.material,
    applianceType: product.applianceType,
    compatibility: product.compatibility,
  }));
};

const buildAssistantPrompt = (question, productContext) => `Ты AI-консультант интернет-магазина "Мир Сальников" в Алматы.
Отвечай по-русски, кратко и по делу. Помогай подобрать сальники, подшипники, ремни, манжеты, прокладки и запчасти для бытовой техники.
Не обещай точную совместимость без подтверждения менеджером. Если данных мало, попроси размер, артикул, модель техники или фото старой детали.
Заказы оформляются без онлайн-оплаты: менеджер подтверждает наличие и итоговую стоимость.

Доступные товары для ориентира:
${JSON.stringify(productContext, null, 2)}

Вопрос клиента: ${question}`;

const askGemini = async ({ question, productContext }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const prompt = buildAssistantPrompt(question, productContext);

  const payload = await withTimeout(async (signal) => {
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 500,
        },
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || `Gemini request failed with ${response.status}`);
    }
    return body;
  });

  const answer = extractGeminiText(payload);
  return answer ? { answer, provider: 'gemini', model: GEMINI_MODEL } : null;
};

const askOpenAi = async ({ question, productContext }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const payload = await withTimeout(async (signal) => {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: buildAssistantPrompt(question, productContext),
        max_output_tokens: 500,
        temperature: 0.35,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || `OpenAI request failed with ${response.status}`);
    }
    return body;
  });

  const answer = extractOpenAiText(payload);
  return answer ? { answer, provider: 'openai', model: OPENAI_MODEL } : null;
};

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

const askHandler = (req, res) => {
  Promise.resolve(handleAsk(req, res)).catch((error) => {
    console.error('[rag.ask.error]', error);
    res.status(500).json({ success: false, message: 'Assistant request failed' });
  });
};

ragRouter.post('/api/rag/ask', askHandler);
ragRouter.post('/api/shop/assistant/ask', askHandler);

const handleAsk = async (req, res) => {
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

  const productContext = getProductContext(question);
  const localResponse = buildShopAnswer(question);
  let aiResponse = null;

  try {
    aiResponse = await askGemini({ question, productContext }) || await askOpenAi({ question, productContext });
  } catch (error) {
    console.error('[rag.ai_provider_error]', error.message);
  }

  const response = aiResponse || { ...localResponse, provider: 'local', model: 'rule-based' };

  return res.json({
    success: true,
    answer: response.answer,
    suggestions: localResponse.suggestions,
    suggestedProducts: productContext.slice(0, 3),
    handoffToManager: response.provider === 'local' || /уточн|менеджер|фото|модель|артикул/i.test(response.answer),
    provider: response.provider,
    model: response.model,
    warning: 'Я могу помочь подобрать варианты, но точную совместимость лучше подтвердить менеджеру.',
  });
};
