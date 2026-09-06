import { MgCard } from './ui/mg-ui';
import {
  formatLiveCoords,
  liveJobStatusLabel,
  openStreetMapLink,
  type LiveTrackingPayload,
} from './live-tracking';

export function LiveTrackingPanel({
  live,
  refreshing,
}: {
  live: LiveTrackingPayload | null;
  refreshing?: boolean;
}) {
  if (!live) {
    return (
      <MgCard>
        <h2 className="mg-section-title">Live track</h2>
        <p className="mg-text-muted">Live courier position appears after pack and rider assignment.</p>
      </MgCard>
    );
  }

  return (
    <MgCard>
      <h2 className="mg-section-title">Live track{refreshing ? ' · updating…' : ''}</h2>
      <p className="mg-text-muted">{live.message}</p>
      {!live.shipments.length ? (
        <p className="mg-list-meta">No shipment job yet.</p>
      ) : (
        <ul className="mg-order-list">
          {live.shipments.map((row) => {
            const coords = formatLiveCoords(row.last_lat, row.last_lng);
            const pickupCoords = formatLiveCoords(row.pickup?.lat ?? null, row.pickup?.lng ?? null);
            return (
              <li key={row.shipment_id}>
                <p className="mg-list-title">{liveJobStatusLabel(row.job_status)}</p>
                <p className="mg-list-meta">
                  {row.assignee_id
                    ? `Rider assigned · ${row.assignee_id.slice(0, 8)}…`
                    : 'Rider not assigned yet'}
                </p>
                {row.drop ? (
                  <p className="mg-text-muted">
                    Drop: {row.drop.city ?? '—'}
                    {row.drop.postal_code ? ` ${row.drop.postal_code}` : ''}
                  </p>
                ) : null}
                {row.pickup ? (
                  <p className="mg-text-muted">
                    Pickup: {row.pickup.city ?? '—'}
                    {row.pickup.postal_code ? ` ${row.pickup.postal_code}` : ''}
                    {pickupCoords ? ` · ${pickupCoords}` : ''}
                  </p>
                ) : null}
                {coords ? (
                  <p className="mg-text-muted">
                    Last GPS: {coords}
                    {row.last_event_type ? ` · ${row.last_event_type}` : ''}
                    {row.last_event_at ? ` · ${new Date(row.last_event_at).toLocaleString()}` : ''}
                    {' · '}
                    <a
                      href={openStreetMapLink(row.last_lat!, row.last_lng!)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open map
                    </a>
                  </p>
                ) : (
                  <p className="mg-text-muted">
                    Rider GPS not reported yet — updates after go-online presence or arrive/pickup/POD.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </MgCard>
  );
}
