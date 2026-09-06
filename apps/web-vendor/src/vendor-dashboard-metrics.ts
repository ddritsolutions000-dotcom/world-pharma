import type {
  VendorInboxItem,
  VendorLot,
  VendorOffer,
  VendorOrder,
  VendorSettlement,
  VendorShipment,
  VendorSupportTicket,
} from './vendor-api';
import type { MarketplaceEligibility } from './vendor-api';

function isToday(iso: string | undefined): boolean {
  if (!iso) {
    return false;
  }
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function statusIn(status: string, list: string[]): boolean {
  return list.includes(status.toUpperCase());
}

/** Order statuses that still need seller action (aligned with backend OrderStatus enum). */
const OPEN_ORDER_STATUSES = [
  'CONFIRMED',
  'ON_HOLD',
  'ALLOCATED',
  'PICKING',
  'PICKED',
  'PACKING',
  'PACKED',
  'READY_TO_SHIP',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'CANCEL_REQUESTED',
  'RETURN_REQUESTED',
  'REFUND_PENDING',
];
const COMPLETED_ORDER_STATUSES = ['DELIVERED', 'SHIPPED', 'OUT_FOR_DELIVERY'];
const CANCELLED_ORDER_STATUSES = ['CANCELLED', 'REFUNDED', 'RETURNED', 'PARTIALLY_REFUNDED', 'FAILED'];
const AWAITING_ACCEPT_STATUSES = ['CONFIRMED', 'ON_HOLD', 'ALLOCATED'];

/** Shipment statuses from backend ShipmentStatus enum (sandbox carrier). */
const SHIPMENT_PENDING_STATUSES = ['DRAFT', 'READY', 'BOOKING', 'BOOKED', 'LABEL_CREATED', 'PICKUP_SCHEDULED'];
const SHIPMENT_PROBLEM_STATUSES = ['BOOKING_FAILED', 'BOOKING_UNKNOWN', 'DELIVERY_FAILED', 'LOST', 'DAMAGED'];
const SHIPMENT_RTO_STATUSES = ['RETURN_TO_ORIGIN', 'RETURNED'];

export type VendorDashboardMetrics = {
  sales: {
    todayOrders: number;
    pendingOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    salesValueMinor: bigint;
    recentCount: number;
  };
  fulfilment: {
    awaitingAcceptance: number;
    packingPending: number;
    readyToShip: number;
    shipmentPending: number;
    deliveryProblems: number;
    rto: number;
  };
  inventory: {
    activeProducts: number;
    lowStock: number;
    outOfStock: number;
    inactiveProducts: number;
  };
  finance: {
    pendingPayableMinor: bigint;
    approvedSettlementMinor: bigint;
    paidPayoutMinor: bigint;
    pendingPayoutMinor: bigint;
    reconciliationIssues: number;
    statementLines: number;
  };
  compliance: {
    kycStatus: string;
    documentsExpiring: number | null;
    rejectedDocuments: number | null;
    infoRequests: number;
  };
  support: {
    openTickets: number;
    urgentTickets: number;
  };
  notifications: {
    unread: number;
    total: number;
  };
};

export function computeVendorDashboardMetrics(input: {
  orders: VendorOrder[];
  offers: VendorOffer[];
  lots: VendorLot[];
  settlements: VendorSettlement[];
  shipments: VendorShipment[];
  tickets: VendorSupportTicket[];
  inbox: VendorInboxItem[];
  eligibility: MarketplaceEligibility | null;
  rejectedDocCount?: number | null;
  expiringDocCount?: number | null;
}): VendorDashboardMetrics {
  const { orders, offers, lots, settlements, shipments, tickets, inbox, eligibility } = input;

  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const pendingOrders = orders.filter((o) => statusIn(o.status, OPEN_ORDER_STATUSES));
  const completedOrders = orders.filter((o) => statusIn(o.status, COMPLETED_ORDER_STATUSES));
  const cancelledOrders = orders.filter((o) => statusIn(o.status, CANCELLED_ORDER_STATUSES));

  const salesValueMinor = orders.reduce<bigint>((acc, o) => {
    try {
      return acc + BigInt(o.total_minor ?? '0');
    } catch {
      return acc;
    }
  }, 0n);

  const pendingPayableMinor = settlements.reduce<bigint>((acc, s) => {
    if (statusIn(s.status, ['PENDING', 'PROCESSING', 'HOLD'])) {
      try {
        return acc + BigInt(s.net_minor ?? '0');
      } catch {
        return acc;
      }
    }
    return acc;
  }, 0n);

  const approvedSettlementMinor = settlements.reduce<bigint>((acc, s) => {
    if (statusIn(s.status, ['APPROVED', 'READY', 'SCHEDULED'])) {
      try {
        return acc + BigInt(s.net_minor ?? '0');
      } catch {
        return acc;
      }
    }
    return acc;
  }, 0n);

  const paidPayoutMinor = settlements.reduce<bigint>((acc, s) => {
    if (statusIn(s.status, ['PAID', 'SETTLED', 'PAID_OUT'])) {
      try {
        return acc + BigInt(s.net_minor ?? '0');
      } catch {
        return acc;
      }
    }
    return acc;
  }, 0n);

  const pendingPayoutMinor = pendingPayableMinor;

  const reconciliationIssues = settlements.filter((s) =>
    statusIn(s.payable_status ?? '', ['DISPUTED', 'HOLD', 'RECON_BREAK']),
  ).length;

  const activeOffers = offers.filter((o) => statusIn(o.status ?? 'ACTIVE', ['ACTIVE', 'PUBLISHED']));
  const inactiveOffers = offers.filter((o) => !statusIn(o.status ?? 'ACTIVE', ['ACTIVE', 'PUBLISHED']));

  const lowStock = lots.filter((l) => l.available > 0 && l.available <= 5).length;
  const outOfStock = lots.filter((l) => l.available <= 0).length;

  const openTickets = tickets.filter((t) => !statusIn(t.status, ['CLOSED', 'RESOLVED']));
  const urgentTickets = tickets.filter((t) =>
    statusIn(t.status, ['OPEN', 'ESCALATED']) && /urgent|priority/i.test(t.subject),
  );

  return {
    sales: {
      todayOrders: todayOrders.length,
      pendingOrders: pendingOrders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      salesValueMinor,
      recentCount: orders.length,
    },
    fulfilment: {
      awaitingAcceptance: orders.filter(
        (o) => statusIn(o.status, AWAITING_ACCEPT_STATUSES) && !o.vendor_accepted,
      ).length,
      packingPending: orders.filter((o) => statusIn(o.status, ['PICKING', 'PICKED', 'PACKING', 'PACKED'])).length,
      readyToShip: orders.filter((o) => statusIn(o.status, ['READY_TO_SHIP'])).length,
      shipmentPending: shipments.filter((s) => statusIn(s.status, SHIPMENT_PENDING_STATUSES)).length,
      deliveryProblems: shipments.filter((s) => statusIn(s.status, SHIPMENT_PROBLEM_STATUSES)).length,
      rto: shipments.filter((s) => statusIn(s.status, SHIPMENT_RTO_STATUSES)).length,
    },
    inventory: {
      activeProducts: activeOffers.length,
      lowStock,
      outOfStock,
      inactiveProducts: inactiveOffers.length,
    },
    finance: {
      pendingPayableMinor,
      approvedSettlementMinor,
      paidPayoutMinor,
      pendingPayoutMinor,
      reconciliationIssues,
      statementLines: settlements.length,
    },
    compliance: {
      kycStatus: eligibility?.state ?? 'UNKNOWN',
      documentsExpiring: input.expiringDocCount ?? null,
      rejectedDocuments: input.rejectedDocCount ?? null,
      infoRequests: eligibility?.blocked_reason ? 1 : 0,
    },
    support: {
      openTickets: openTickets.length,
      urgentTickets: urgentTickets.length,
    },
    notifications: {
      unread: inbox.filter((n) => !n.read).length,
      total: inbox.length,
    },
  };
}
