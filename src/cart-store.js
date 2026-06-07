import {
  createCartSession,
  fetchCartSession,
  addCartItem as apiAddCartItem,
  updateCartItem as apiUpdateCartItem,
  deleteCartItem as apiDeleteCartItem,
} from './api.js';

const SESSION_STORAGE_KEY = 'mir_salnikov_shop_session';
let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
let currentCart = null;

const createSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const saveSessionId = (id) => {
  sessionId = id;
  localStorage.setItem(SESSION_STORAGE_KEY, id);
};

const ensureSession = async () => {
  if (!sessionId) {
    saveSessionId(createSessionId());
  }
  const response = await createCartSession(sessionId);
  saveSessionId(response.sessionId || sessionId);
  currentCart = response.cart;
  return currentCart;
};

export const initCart = async () => {
  try {
    const current = sessionId ? await fetchCartSession(sessionId) : null;
    if (current && current.cart) {
      currentCart = current.cart;
      return currentCart;
    }
    return await ensureSession();
  } catch (error) {
    return await ensureSession();
  }
};

export const getCart = () => currentCart || { items: [], totalAmount: 0, itemCount: 0 };

export const getSessionId = () => sessionId;

export const addToCart = async (productId, quantity = 1) => {
  const current = await ensureSession();
  const response = await apiAddCartItem(current.sessionId, productId, quantity);
  currentCart = response.cart;
  return currentCart;
};

export const updateItem = async (itemId, quantity) => {
  if (!sessionId) throw new Error('Session is missing');
  const response = await apiUpdateCartItem(sessionId, itemId, quantity);
  currentCart = response.cart;
  return currentCart;
};

export const removeItem = async (itemId) => {
  if (!sessionId) throw new Error('Session is missing');
  const response = await apiDeleteCartItem(sessionId, itemId);
  currentCart = response.cart;
  return currentCart;
};

export const setCart = (cart) => {
  currentCart = cart;
};
