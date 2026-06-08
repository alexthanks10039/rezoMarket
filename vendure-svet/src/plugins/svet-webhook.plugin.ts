import {
  CustomerEvent,
  EventBus,
  OrderPlacedEvent,
  OrderStateTransitionEvent,
  PluginCommonModule,
  ProductEvent,
  ProductVariantEvent,
  VendurePlugin,
} from '@vendure/core';
import crypto from 'crypto';
import { Subscription } from 'rxjs';

const backendUrl = () => String(process.env.SVET_BACKEND_URL || '').replace(/\/$/, '');

const signBody = (body: string): Record<string, string> => {
  const secret = process.env.VENDURE_WEBHOOK_SECRET;
  if (!secret) return {};
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return { 'x-vendure-signature': `sha256=${signature}` };
};

const postEvent = async (payload: unknown) => {
  const url = backendUrl();
  if (!url) return;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...signBody(body),
  };
  await fetch(`${url}/api/integrations/vendure/webhook`, {
    method: 'POST',
    headers,
    body,
  }).catch((error) => {
    console.error('[SvetWebhookPlugin] delivery failed', error.message);
  });
};

@VendurePlugin({
  imports: [PluginCommonModule],
  compatibility: '^3.0.0',
})
export class SvetWebhookPlugin {
  private subscriptions: Subscription[] = [];

  constructor(private eventBus: EventBus) {}

  onApplicationBootstrap() {
    this.subscriptions.push(
      this.eventBus.ofType(ProductEvent).subscribe((event) => {
        void postEvent({
          eventType: `product.${event.type}`,
          entity: event.entity,
        });
      }),
      this.eventBus.ofType(ProductVariantEvent).subscribe((event) => {
        void postEvent({
          eventType: `productVariant.${event.type}`,
          entity: event.entity,
        });
      }),
      this.eventBus.ofType(OrderPlacedEvent).subscribe((event) => {
        void postEvent({
          eventType: 'order.created',
          entity: event.order,
        });
      }),
      this.eventBus.ofType(OrderStateTransitionEvent).subscribe((event) => {
        void postEvent({
          eventType: 'order.stateTransition',
          entity: event.order,
          fromState: event.fromState,
          toState: event.toState,
        });
      }),
      this.eventBus.ofType(CustomerEvent).subscribe((event) => {
        void postEvent({
          eventType: `customer.${event.type}`,
          entity: event.entity,
        });
      }),
    );
  }

  onApplicationShutdown() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }
}
