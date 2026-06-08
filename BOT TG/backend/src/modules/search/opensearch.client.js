const getNode = () => (process.env.OPENSEARCH_NODE || process.env.OPENSEARCH_URL || '').replace(/\/$/, '');

const buildHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  const username = process.env.OPENSEARCH_USERNAME;
  const password = process.env.OPENSEARCH_PASSWORD;
  if (username && password) {
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }
  return headers;
};

export const isOpenSearchConfigured = () => Boolean(getNode());

export const opensearchRequest = async (path, options = {}) => {
  const node = getNode();
  if (!node) {
    throw new Error('OPENSEARCH_NODE is not configured');
  }

  const response = await fetch(`${node}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_error) {
    payload = text;
  }

  if (!response.ok) {
    const message = payload?.error?.reason || payload?.error?.type || response.statusText;
    throw new Error(`OpenSearch ${response.status}: ${message}`);
  }

  return payload;
};

