import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { leadsRouter } from './leads.routes.js';
import { botRouter } from './bot.routes.js';
import { shopRouter } from './shop/routes.js';
import { ragRouter } from './rag.routes.js';
import { vendureIntegrationRouter } from './modules/integrations/vendure/vendure.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { shopAnalyticsRouter } from './modules/shop-analytics/shop-analytics.routes.js';
import { selectionRouter } from './modules/selection/selection.routes.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => {
    req.rawBody = buffer.toString('utf8');
  },
}));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'bot-tg-backend',
  });
});

app.use(leadsRouter);
app.use(shopRouter);
app.use(searchRouter);
app.use(shopAnalyticsRouter);
app.use(selectionRouter);
app.use(ragRouter);
app.use(vendureIntegrationRouter);
app.use(botRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

app.listen(port, () => {
  console.log(`[bot-tg-backend] listening on http://localhost:${port}`);
});
