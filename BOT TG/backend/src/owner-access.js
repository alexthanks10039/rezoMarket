export const ACCESS_MODE = 'owner-only';

const normalizeId = (value) => String(value || '').trim();

export const getOwnerId = () => normalizeId(process.env.OWNER_ID);

export const isOwnerTelegramUser = (telegramUserId) => {
  const ownerId = getOwnerId();
  const userId = normalizeId(telegramUserId);

  if (!ownerId) {
    throw new Error('OWNER_ID is not configured');
  }

  return userId.length > 0 && userId === ownerId;
};

export const getTelegramUserIdFromRequest = (req) => {
  return (
    req.query?.telegramUserId ||
    req.body?.telegramUserId ||
    req.headers?.['x-telegram-user-id'] ||
    ''
  );
};

export const requireOwnerAccess = (req, res, next) => {
  try {
    const telegramUserId = getTelegramUserIdFromRequest(req);

    if (!isOwnerTelegramUser(telegramUserId)) {
      return res.status(403).json({
        success: false,
        accessMode: ACCESS_MODE,
        message: 'Owner access required',
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      accessMode: ACCESS_MODE,
      message: error.message,
    });
  }
};
