import 'reflect-metadata';
import { bootstrapWorker } from '@vendure/core';
import { config } from './vendure-config';

bootstrapWorker(config)
  .then(() => {
    console.log('[vendure-svet] worker started');
  })
  .catch((error) => {
    console.error('[vendure-svet] failed to start worker', error);
    process.exit(1);
  });

