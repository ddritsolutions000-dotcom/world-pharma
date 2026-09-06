/** Haversine distance in kilometers (WGS-84 sphere). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type GeoPoint = { latitude: number; longitude: number };

export type NearestCandidate<T> = T & {
  latitude?: number | null;
  longitude?: number | null;
  postalCode?: string | null;
  city?: string | null;
};

/**
 * Rank fulfillment locations: same postal → same city → haversine → FEFO fallback order.
 * Returns sorted copy (nearest / best first).
 */
export function rankByNearestDestination<T>(
  candidates: NearestCandidate<T>[],
  destination: {
    latitude?: number | null;
    longitude?: number | null;
    postalCode?: string | null;
    city?: string | null;
  } | null,
): NearestCandidate<T>[] {
  if (!candidates.length) {
    return [];
  }
  if (!destination) {
    return [...candidates];
  }
  const destPostal = (destination.postalCode ?? '').trim().toUpperCase();
  const destCity = (destination.city ?? '').trim().toLowerCase();
  const destLat = destination.latitude;
  const destLng = destination.longitude;
  const hasDestGeo =
    typeof destLat === 'number' &&
    Number.isFinite(destLat) &&
    typeof destLng === 'number' &&
    Number.isFinite(destLng);

  return [...candidates]
    .map((row, index) => {
      const postal = (row.postalCode ?? '').trim().toUpperCase();
      const city = (row.city ?? '').trim().toLowerCase();
      let score = 1_000_000 + index; // preserve FEFO as tie-breaker
      if (destPostal && postal && postal === destPostal) {
        score = 0 + index * 0.001;
      } else if (destCity && city && city === destCity) {
        score = 100 + index * 0.001;
      } else if (
        hasDestGeo &&
        typeof row.latitude === 'number' &&
        Number.isFinite(row.latitude) &&
        typeof row.longitude === 'number' &&
        Number.isFinite(row.longitude)
      ) {
        score = 200 + haversineKm(destLat!, destLng!, row.latitude, row.longitude);
      }
      return { row, score };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.row);
}

export type OnlineRiderCandidate = {
  personId: string;
  organizationId?: string | null;
  updatedAt: Date;
  latitude?: number | null;
  longitude?: number | null;
};

export type RiderPickupPoint = {
  latitude?: number | null;
  longitude?: number | null;
  postalCode?: string | null;
  city?: string | null;
};

function hasFiniteCoords(lat?: number | null, lng?: number | null): boolean {
  return (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  );
}

/**
 * Pick nearest online rider to pickup warehouse.
 * 1) Riders with GPS + pickup geo → Haversine (via rankByNearestDestination)
 * 2) Prefer preferredOrganizationId among remaining
 * 3) Freshest updatedAt
 */
export function pickNearestOnlineRider(
  riders: OnlineRiderCandidate[],
  pickup: RiderPickupPoint | null,
  opts?: { preferredOrganizationId?: string | null },
): OnlineRiderCandidate | null {
  if (!riders.length) {
    return null;
  }

  const preferredOrg = opts?.preferredOrganizationId ?? null;
  const withGeo = riders.filter((r) => hasFiniteCoords(r.latitude, r.longitude));
  const pickupHasGeo = hasFiniteCoords(pickup?.latitude, pickup?.longitude);

  if (withGeo.length && pickupHasGeo) {
    const ranked = rankByNearestDestination(
      withGeo.map((r) => ({
        ...r,
        latitude: r.latitude,
        longitude: r.longitude,
      })),
      {
        latitude: pickup!.latitude,
        longitude: pickup!.longitude,
        postalCode: pickup?.postalCode ?? null,
        city: pickup?.city ?? null,
      },
    );
    const best = ranked[0];
    if (best) {
      return best;
    }
  }

  const byOrg =
    preferredOrg != null
      ? riders.find((r) => r.organizationId === preferredOrg)
      : undefined;
  if (byOrg) {
    return byOrg;
  }

  return [...riders].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
}
