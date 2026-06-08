import 'reflect-metadata';
import { bootstrap } from '@vendure/core';
import { config } from './vendure-config';

bootstrap(config)
  .then(() => {
    console.log(`[vendure-svet] server listening on http://localhost:${config.apiOptions.port}`);
  })
  .catch((error) => {
    console.error('[vendure-svet] failed to start server', error);
    process.exit(1);
  });

