// Event payloads for decoupled notifications across the platform

export const EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  MESSAGE_RECEIVED: 'message.received',
  ESCROW_RELEASED: 'escrow.released',
  ESCROW_REFUNDED: 'escrow.refunded',
  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_REJECTED: 'payment.rejected',
  DISPUTE_OPENED: 'dispute.opened',
  DISPUTE_RESOLVED: 'dispute.resolved',
  KYC_STATUS_CHANGED: 'kyc.status_changed',
  REVIEW_APPROVED: 'review.approved',
} as const;

export interface OrderCreatedEvent {
  orderId: number;
  buyerId: number;
  sellerId: number;
  gigTitle: string;
  totalPrice: string;
}

export interface OrderStatusChangedEvent {
  orderId: number;
  buyerId: number;
  sellerId: number;
  oldStatus: string;
  newStatus: string;
  gigTitle: string;
}

export interface MessageReceivedEvent {
  messageId: number;
  orderId: number;
  senderId: number;
  recipientId: number;
  senderName: string;
  content: string;
}

export interface EscrowReleasedEvent {
  orderId: number;
  sellerId: number;
  amountNano: string;
  txHash?: string;
}

export interface EscrowRefundedEvent {
  orderId: number;
  buyerId: number;
  amountNano: string;
}

export interface PaymentApprovedEvent {
  paymentId: number;
  userId: number;
  amountManat: string;
}

export interface PaymentRejectedEvent {
  paymentId: number;
  userId: number;
  amountManat: string;
  reason?: string;
}

export interface DisputeOpenedEvent {
  disputeId: number;
  orderId: number;
  initiatorId: number;
  reason: string;
}

export interface DisputeResolvedEvent {
  disputeId: number;
  orderId: number;
  resolution: string;
  resolverNote?: string;
}

export interface KycStatusChangedEvent {
  userId: number;
  status: 'approved' | 'rejected';
}

/**
 * S1-2: Emitted by AdminService.moderateReview() after a review is approved.
 * ReviewsService listens for this event to trigger rating recalculation.
 */
export interface ReviewApprovedEvent {
  reviewId: number;
}
