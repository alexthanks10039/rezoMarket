import * as shopStore from '../../shop/store.js';

export const requireAdminKey = (req, res, next) => {
  const key = req.headers['x-admin-key'] || req.query.adminKey || req.body?.adminKey;
  if (!shopStore.isAdminKeyValid(key)) {
    return res.status(403).json({ success: false, message: 'Admin key required' });
  }
  return next();
};

