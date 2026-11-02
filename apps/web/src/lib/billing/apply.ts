import type { SubscriptionUpdate } from "@kitchen-pantry/integrations";

/** Arguments for apply_subscription_event (migration …2800). */
export function applyUpdateArgs(u: SubscriptionUpdate) {
  return {
    event_id: u.eventId,
    event_source: u.eventSource,
    target_user: u.userId,
    sub_source: u.source,
    sub_external_id: u.externalId,
    sub_status: u.status,
    sub_product_id: u.productId,
    sub_expires_at: u.expiresAt,
    sub_will_renew: u.willRenew,
    sub_customer_id: u.customerId,
    event_at: u.eventAt,
  };
}
