import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { NativeButton, NativeCard, NativeEmptyState, NativeLoadingState, NativeText } from '@world-pharma/ui-kit/native';
import { fetchHealthDashboard, type HealthDashboardResponse } from './health-api';
import { classifyHealthApiFailure, formatWhen, recordLabel, recordWhen } from './health-utils';

export function MobileHomeSummary({
  token,
  countryCode,
  onUnauthorized,
  onOpenAppointments,
  onOpenOrders,
  onOpenHealth,
  onOpenPrescriptions,
  onOpenLabBooking,
}: {
  token: string;
  countryCode: string;
  onUnauthorized: () => void;
  onOpenAppointments: () => void;
  onOpenOrders: () => void;
  onOpenHealth: () => void;
  onOpenPrescriptions: () => void;
  onOpenLabBooking: (bookingId: string) => void;
}) {
  const [dashboard, setDashboard] = useState<HealthDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchHealthDashboard({ token, onUnauthorized, countryCode });
    if (result.ok) {
      setDashboard(result.data);
      setLoading(false);
      return;
    }
    const failure = classifyHealthApiFailure(result);
    if (failure === 'unauthorized') {
      onUnauthorized();
      return;
    }
    setDashboard(null);
    setError(failure === 'network' ? 'Could not load your health summary.' : null);
    setLoading(false);
  }, [countryCode, onUnauthorized, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <NativeLoadingState title="Loading your overview" />;
  }

  if (!dashboard) {
    return error ? (
      <NativeCard>
        <NativeText variant="caption">{error}</NativeText>
        <NativeButton label="Retry" variant="secondary" onPress={() => void load()} />
      </NativeCard>
    ) : null;
  }

  const upcoming = dashboard.overview.upcoming_appointments[0];
  const recentOrder = dashboard.overview.recent_orders[0];
  const recentActivity = dashboard.recent_activity.items[0];
  const pendingCount = dashboard.overview.pending_actions.length;

  const hasPersonal =
    Boolean(upcoming) || Boolean(recentOrder) || Boolean(recentActivity) || pendingCount > 0;

  return (
    <View style={{ gap: 8 }}>
      <NativeText variant="h2">Your care overview</NativeText>
      {!hasPersonal ? (
        <NativeEmptyState
          title="No recent activity yet"
          description="Book a doctor, lab test, or order medicines to see updates here."
        />
      ) : null}
      {upcoming ? (
        <NativeCard>
          <NativeText variant="bodySm">Upcoming appointment</NativeText>
          <NativeText>{recordLabel(upcoming, 'Consultation')}</NativeText>
          <NativeText variant="caption">{recordWhen(upcoming)}</NativeText>
          <NativeButton label="View appointments" variant="secondary" onPress={onOpenAppointments} />
        </NativeCard>
      ) : null}
      {recentOrder ? (
        <NativeCard>
          <NativeText variant="bodySm">Recent order</NativeText>
          <NativeText>{recordLabel(recentOrder, 'Order')}</NativeText>
          <NativeText variant="caption">{recordWhen(recentOrder)}</NativeText>
          <NativeButton label="View orders" variant="secondary" onPress={onOpenOrders} />
        </NativeCard>
      ) : null}
      {recentActivity ? (
        <NativeCard>
          <NativeText variant="bodySm">Recent health activity</NativeText>
          <NativeText>{recentActivity.title}</NativeText>
          <NativeText variant="caption">{formatWhen(recentActivity.occurred_at)}</NativeText>
          <NativeButton label="Open health dashboard" variant="secondary" onPress={onOpenHealth} />
        </NativeCard>
      ) : null}
      {pendingCount > 0 ? (
        <NativeCard>
          <NativeText variant="bodySm">{`${pendingCount} pending health action${pendingCount === 1 ? '' : 's'}`}</NativeText>
          {dashboard.overview.pending_actions.slice(0, 2).map((action) => (
            <View key={`${action.kind}-${action.id}`}>
              <NativeText variant="caption">{action.title}</NativeText>
            </View>
          ))}
          <NativeButton label="Review in Health" variant="secondary" onPress={onOpenHealth} />
        </NativeCard>
      ) : null}
      {dashboard.overview.recent_prescriptions.length ? (
        <NativeButton label="Prescriptions" variant="secondary" onPress={onOpenPrescriptions} />
      ) : null}
      {dashboard.overview.recent_lab_bookings[0] ? (
        <NativeButton
          label="Latest lab booking"
          variant="secondary"
          onPress={() => onOpenLabBooking(String(dashboard.overview.recent_lab_bookings[0]!.id))}
        />
      ) : null}
    </View>
  );
}
