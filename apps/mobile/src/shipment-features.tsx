import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import { fetchShipment, fetchShipments, type CustomerShipmentDetail } from './commerce-api';
import { shipmentLifecycleSummary, shipmentStatusLabel } from './shipment-status-labels';
import type { FeatureCtx } from './customer-features';
import type { ViewState } from './navigation';

function FeatureStates({ viewState, onRetry }: { viewState: ViewState; onRetry: () => void }) {
  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  return null;
}

export function ShipmentsListScreen({
  ctx,
  onOpen,
}: {
  ctx: FeatureCtx;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<Array<{ id: string; status: string; tracking_number?: string }>>([]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const body = await fetchShipments(ctx.token);
      setRows(body.data ?? []);
      ctx.setViewState('idle');
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        ctx.setViewState('forbidden');
      } else {
        ctx.setViewState('network');
      }
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 12 }}>
      <NativeText variant="h2">Shipments</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && rows.length === 0 ? (
        <NativeEmptyState title="No shipments" description="Shipments appear after your order is fulfilled." />
      ) : null}
      {ctx.viewState === 'idle'
        ? rows.map((row) => {
            const lifecycle = shipmentLifecycleSummary(row.status);
            return (
              <View key={row.id}>
                <NativeCard>
                  <NativeText>{lifecycle.headline}</NativeText>
                  <NativeText variant="caption">{shipmentStatusLabel(row.status)}</NativeText>
                  <NativeText variant="caption">{row.tracking_number ?? 'Tracking pending'}</NativeText>
                  <NativeButton label="Track delivery" variant="secondary" onPress={() => onOpen(row.id)} />
                </NativeCard>
              </View>
            );
          })
        : null}
    </View>
  );
}

export function ShipmentDetailScreen({
  ctx,
  shipmentId,
  onBack,
}: {
  ctx: FeatureCtx;
  shipmentId: string;
  onBack: () => void;
}) {
  const [row, setRow] = useState<CustomerShipmentDetail | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    try {
      const body = await fetchShipment(ctx.token, shipmentId);
      setRow(body);
      ctx.setViewState('idle');
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        ctx.setViewState('forbidden');
      } else {
        ctx.setViewState('network');
      }
    }
  }, [ctx, shipmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lifecycle = row ? shipmentLifecycleSummary(row.status) : null;

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Shipment tracking</NativeText>
      <NativeText variant="caption">Sandbox mock carrier. No live GPS or ETA.</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />
      {ctx.viewState === 'idle' && row ? (
        <>
          <NativeCard>
            <NativeText>{lifecycle?.headline ?? shipmentStatusLabel(row.status)}</NativeText>
            {lifecycle?.detail ? <NativeText variant="caption">{lifecycle.detail}</NativeText> : null}
            <NativeText variant="caption">{shipmentStatusLabel(row.status)}</NativeText>
            <NativeText variant="caption">{row.tracking_number ?? 'Tracking pending'}</NativeText>
          </NativeCard>
          {row.timeline.length === 0 ? (
            <NativeEmptyState title="No tracking events yet" description="Updates appear when reported." />
          ) : (
            row.timeline.map((event, index) => (
              <View key={`${event.status}-${event.at}-${index}`}>
                <NativeCard>
                  <NativeText>{shipmentStatusLabel(event.status)}</NativeText>
                  {event.description ? <NativeText variant="caption">{event.description}</NativeText> : null}
                  <NativeText variant="caption">{event.at}</NativeText>
                </NativeCard>
              </View>
            ))
          )}
        </>
      ) : null}
    </View>
  );
}
