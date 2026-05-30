/**
 * S3-1: Subscription tier gig limits.
 *
 * Defines the maximum number of active gigs a seller may hold per tier.
 * GigsService.create() checks this before allowing a new gig to be created.
 * SubscriptionsService.resume() re-validates the limit when a paused gig is reactivated
 * (the seller's tier may have been downgraded since the gig was paused).
 *
 * To change limits: update this map and restart the service — no migration needed.
 */
export const TIER_GIG_LIMITS: Record<string, number> = {
  free: 3,
  pro: 20,
  business: 9999,
};

/** Human-readable tier names for error messages and notifications. */
export const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  business: 'Business',
};
