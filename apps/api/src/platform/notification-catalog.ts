export type InboxCategory =
  | 'appointment'
  | 'video'
  | 'order'
  | 'lab_booking'
  | 'imaging_booking'
  | 'prescription'
  | 'health_artifact'
  | 'care_plan'
  | 'shipment'
  | 'support'
  | 'partner_application'
  | 'credential'
  | 'settlement'
  | 'payment'
  | 'affiliate';

export type NotificationPrefKey =
  | 'email_enabled'
  | 'push_enabled'
  | 'sms_enabled'
  | 'order_updates'
  | 'appointment_updates'
  | 'delivery_updates'
  | 'settlement_updates'
  | 'support_updates'
  | 'marketing';

export type NotificationEventMeta = {
  title: string;
  category: InboxCategory;
  pref: NotificationPrefKey;
};

/** Domain events that produce in-app notifications (sandbox). */
export const TITLE_BY_EVENT: Record<string, NotificationEventMeta> = {
  APPOINTMENT_CREATED: { title: 'Appointment requested', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_CONFIRMED: { title: 'Appointment confirmed', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_RESCHEDULED: { title: 'Appointment rescheduled', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_CANCELLED: { title: 'Appointment cancelled', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_CHECKED_IN: { title: 'Checked in for appointment', category: 'appointment', pref: 'appointment_updates' },
  APPOINTMENT_NO_SHOW: { title: 'Appointment marked no-show', category: 'appointment', pref: 'appointment_updates' },
  ENCOUNTER_COMPLETED: { title: 'Consultation completed', category: 'appointment', pref: 'appointment_updates' },
  VIDEO_SESSION_READY: { title: 'Video consult ready', category: 'video', pref: 'appointment_updates' },
  VIDEO_PARTICIPANT_JOINED: { title: 'Participant joined video', category: 'video', pref: 'appointment_updates' },
  VIDEO_SESSION_STARTED: { title: 'Video consult started', category: 'video', pref: 'appointment_updates' },
  VIDEO_SESSION_ENDED: { title: 'Video consult ended', category: 'video', pref: 'appointment_updates' },
  ORDER_CREATED: { title: 'Order placed', category: 'order', pref: 'order_updates' },
  ORDER_CONFIRMED: { title: 'Order confirmed', category: 'order', pref: 'order_updates' },
  ORDER_ALLOCATED: { title: 'New order received', category: 'order', pref: 'order_updates' },
  ORDER_RETURN_REQUESTED: { title: 'Return requested', category: 'order', pref: 'order_updates' },
  ORDER_RETURNED: { title: 'Return received', category: 'order', pref: 'order_updates' },
  ORDER_REFUND_PENDING: { title: 'Refund processing', category: 'order', pref: 'order_updates' },
  ORDER_REFUNDED: { title: 'Refund completed', category: 'order', pref: 'order_updates' },
  MEDICATION_REMINDER_CREATED: {
    title: 'Medication reminder set',
    category: 'order',
    pref: 'order_updates',
  },
  ORDER_READY_FOR_SHIPMENT: { title: 'Order ready for shipment', category: 'order', pref: 'order_updates' },
  ORDER_SHIPPED: { title: 'Order shipped', category: 'order', pref: 'order_updates' },
  ORDER_OUT_FOR_DELIVERY: { title: 'Order out for delivery', category: 'order', pref: 'order_updates' },
  ORDER_DELIVERED: { title: 'Order delivered', category: 'order', pref: 'order_updates' },
  ORDER_FAILED: { title: 'Delivery issue', category: 'order', pref: 'order_updates' },
  ORDER_CANCELLED: { title: 'Order cancelled', category: 'order', pref: 'order_updates' },
  SHIPMENT_CREATED: { title: 'Shipment created', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_PICKED_UP: { title: 'Shipment picked up', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_IN_TRANSIT: { title: 'Shipment in transit', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_OUT_FOR_DELIVERY: { title: 'Out for delivery', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_DELIVERED: { title: 'Shipment delivered', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_FAILED: { title: 'Shipment failed', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_RETURNED: { title: 'Shipment returned', category: 'shipment', pref: 'delivery_updates' },
  SHIPMENT_CANCELLED: { title: 'Shipment cancelled', category: 'shipment', pref: 'delivery_updates' },
  DELIVERY_OTP_REQUESTED: {
    title: 'Delivery verification code requested',
    category: 'shipment',
    pref: 'delivery_updates',
  },
  DELIVERY_OTP_VERIFIED: {
    title: 'Delivery verified',
    category: 'shipment',
    pref: 'delivery_updates',
  },
  PRESCRIPTION_CREATED: { title: 'Prescription status updated', category: 'prescription', pref: 'appointment_updates' },
  PRESCRIPTION_ISSUED: { title: 'A prescription is available', category: 'prescription', pref: 'appointment_updates' },
  REFILL_REQUESTED: { title: 'Refill requested', category: 'appointment', pref: 'appointment_updates' },
  REFILL_APPROVED: { title: 'Refill authorized', category: 'appointment', pref: 'appointment_updates' },
  REFILL_REJECTED: { title: 'Refill not authorized', category: 'appointment', pref: 'appointment_updates' },
  PRESCRIPTION_AMENDED: { title: 'Prescription status updated', category: 'prescription', pref: 'appointment_updates' },
  PRESCRIPTION_CANCELLED: { title: 'Prescription cancelled', category: 'prescription', pref: 'appointment_updates' },
  SUPPORT_TICKET_CREATED: { title: 'Support ticket received', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_UPDATED: { title: 'Support ticket updated', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_ASSIGNED: { title: 'Support ticket assigned', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_CUSTOMER_REPLY: { title: 'Support reply received', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_AGENT_REPLY: { title: 'Support team replied', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_RESOLVED: { title: 'Support ticket resolved', category: 'support', pref: 'support_updates' },
  SUPPORT_TICKET_CLOSED: { title: 'Support ticket closed', category: 'support', pref: 'support_updates' },
  LAB_BOOKING_CREATED: { title: 'Lab booking created', category: 'lab_booking', pref: 'order_updates' },
  LAB_BOOKING_CONFIRMED: { title: 'Lab booking confirmed', category: 'lab_booking', pref: 'order_updates' },
  LAB_BOOKING_CANCELLED: { title: 'Lab booking cancelled', category: 'lab_booking', pref: 'order_updates' },
  LAB_BOOKING_PAYMENT_FAILED: { title: 'Lab booking payment failed', category: 'lab_booking', pref: 'order_updates' },
  IMAGING_BOOKING_CREATED: { title: 'Imaging booking created', category: 'imaging_booking', pref: 'order_updates' },
  IMAGING_BOOKING_CONFIRMED: { title: 'Imaging booking confirmed', category: 'imaging_booking', pref: 'order_updates' },
  IMAGING_BOOKING_CANCELLED: { title: 'Imaging booking cancelled', category: 'imaging_booking', pref: 'order_updates' },
  IMAGING_BOOKING_PAYMENT_FAILED: {
    title: 'Imaging booking payment failed',
    category: 'imaging_booking',
    pref: 'order_updates',
  },
  LAB_SAMPLE_ASSIGNED: { title: 'Lab sample collection scheduled', category: 'lab_booking', pref: 'order_updates' },
  LAB_SAMPLE_COLLECTED: { title: 'Lab sample collected', category: 'lab_booking', pref: 'order_updates' },
  LAB_SAMPLE_HANDED_OVER: { title: 'Lab sample handed over', category: 'lab_booking', pref: 'order_updates' },
  LAB_SAMPLE_TRANSPORT_ENQUEUED: {
    title: 'Lab sample transport scheduled',
    category: 'lab_booking',
    pref: 'order_updates',
  },
  LAB_SAMPLE_COLLECTION_FAILED: {
    title: 'Lab sample collection issue',
    category: 'lab_booking',
    pref: 'order_updates',
  },
  LAB_SAMPLE_COC_UPDATED: { title: 'Lab sample status updated', category: 'lab_booking', pref: 'order_updates' },
  LAB_REPORT_PUBLISHED: { title: 'Lab report ready', category: 'health_artifact', pref: 'order_updates' },
  LAB_REPORT_AMENDED: { title: 'Lab report updated', category: 'health_artifact', pref: 'order_updates' },
  IMAGING_REPORT_PUBLISHED: { title: 'Imaging report ready', category: 'health_artifact', pref: 'order_updates' },
  IMAGING_REPORT_AMENDED: { title: 'Imaging report updated', category: 'health_artifact', pref: 'order_updates' },
  IMAGING_STUDY_INGESTED: { title: 'Imaging study acquired', category: 'imaging_booking', pref: 'order_updates' },
  PARTNER_APPLICATION_SUBMITTED: {
    title: 'Partner application submitted',
    category: 'partner_application',
    pref: 'support_updates',
  },
  PARTNER_STATUS_CHANGED: {
    title: 'Partner application updated',
    category: 'partner_application',
    pref: 'support_updates',
  },
  DOCTOR_CREDENTIAL_REVIEWED: {
    title: 'Credential review updated',
    category: 'credential',
    pref: 'support_updates',
  },
  PHYSICAL_REPORT_REQUESTED: { title: 'Physical report requested', category: 'lab_booking', pref: 'order_updates' },
  PHYSICAL_REPORT_ACCEPTED: { title: 'Physical report accepted', category: 'lab_booking', pref: 'order_updates' },
  PHYSICAL_REPORT_DISPATCHED: {
    title: 'Physical report dispatched',
    category: 'shipment',
    pref: 'delivery_updates',
  },
  PHYSICAL_REPORT_DELIVERED: {
    title: 'Physical report delivered',
    category: 'shipment',
    pref: 'delivery_updates',
  },
  PHYSICAL_REPORT_FAILED: {
    title: 'Physical report delivery issue',
    category: 'shipment',
    pref: 'delivery_updates',
  },
  PHYSICAL_REPORT_CANCELLED: { title: 'Physical report cancelled', category: 'lab_booking', pref: 'order_updates' },
  SETTLEMENT_CREATED: { title: 'Settlement statement ready', category: 'settlement', pref: 'settlement_updates' },
  SETTLEMENT_APPROVED: { title: 'Settlement approved', category: 'settlement', pref: 'settlement_updates' },
  PAYOUT_PAID: { title: 'Payout completed', category: 'settlement', pref: 'settlement_updates' },
  PAYOUT_FAILED: { title: 'Payout failed', category: 'settlement', pref: 'settlement_updates' },
  PAYOUT_UNKNOWN: { title: 'Payout status unknown', category: 'settlement', pref: 'settlement_updates' },
  PAYMENT_REQUIRES_ACTION: { title: 'Payment requires action', category: 'payment', pref: 'order_updates' },
  PAYMENT_CAPTURED: { title: 'Payment captured', category: 'payment', pref: 'order_updates' },
  PAYMENT_FAILED: { title: 'Payment failed', category: 'payment', pref: 'order_updates' },
  PAYMENT_REFUNDED: { title: 'Refund completed', category: 'payment', pref: 'order_updates' },
  AFFILIATE_LIABILITY_CREATED: {
    title: 'Affiliate commission recorded',
    category: 'affiliate',
    pref: 'settlement_updates',
  },
  AFFILIATE_APPROVED: {
    title: 'Affiliate commission approved',
    category: 'affiliate',
    pref: 'settlement_updates',
  },
  AFFILIATE_PAYABLE: {
    title: 'Affiliate commission payable',
    category: 'affiliate',
    pref: 'settlement_updates',
  },
  AFFILIATE_REVERSED: { title: 'Affiliate commission reversed', category: 'affiliate', pref: 'settlement_updates' },
};

export const NOTIFICATION_EVENT_TYPES = Object.keys(TITLE_BY_EVENT);
