import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const NAVY = '#1A365D';
const INK = '#1A202C';
const MUTED = '#718096';
const LINE = '#E2E8F0';
const PANEL = '#FFFFFF';
const ACCENT = '#0D9488';
const WARN = '#D69E2E';
const PICK = '#2B6CB0';
const DROP = '#2F855A';

export async function readDeviceGps(): Promise<{
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
} | null> {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo) {
    return null;
  }
  return new Promise((resolve) => {
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 },
    );
  });
}

export function openTurnByTurn(query: string) {
  const dest = encodeURIComponent(query.trim() || 'pharmacy');
  return Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`);
}

export function OpsShell({
  product,
  status,
  tabs,
  active,
  onSelect,
  children,
  accent = ACCENT,
}: {
  product: string;
  status?: string;
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>WORLD-PHARMA™</Text>
          <Text style={styles.product}>{product}</Text>
        </View>
        {status ? (
          <View style={[styles.statusChip, { borderColor: accent }]}>
            <View style={[styles.statusDot, { backgroundColor: accent }]} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.accentRail, { backgroundColor: accent }]} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              style={styles.tab}
              onPress={() => onSelect(tab.id)}
            >
              <Text style={on ? [styles.tabOn, { color: accent }] : styles.tabOff}>{tab.label}</Text>
              {on ? <View style={[styles.tabIndicator, { backgroundColor: accent }]} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function OpsKpiRow({
  items,
}: {
  items: Array<{ label: string; value: string | number }>;
}) {
  return (
    <View style={styles.kpiRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.kpi}>
          <Text style={styles.kpiValue}>{item.value}</Text>
          <Text style={styles.kpiLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function OpsWorkCard({
  kicker,
  title,
  meta,
  status,
  onOpen,
  actionLabel,
  onAction,
}: {
  kicker?: string;
  title: string;
  meta?: string;
  status?: string;
  onOpen?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.work}>
      <Pressable accessibilityRole="button" onPress={onOpen} disabled={!onOpen}>
        <View style={styles.workHead}>
          {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
          {status ? <Text style={styles.pill}>{status}</Text> : null}
        </View>
        <Text style={styles.workTitle}>{title}</Text>
        {meta ? <Text style={styles.workMeta}>{meta}</Text> : null}
      </Pressable>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} style={styles.action} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OpsStopRow({
  kind,
  title,
  address,
  onNavigate,
}: {
  kind: 'pickup' | 'drop';
  title: string;
  address: string;
  onNavigate: () => void;
}) {
  const color = kind === 'pickup' ? PICK : DROP;
  return (
    <View style={styles.stop}>
      <View style={[styles.stopMark, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.stopKind, { color }]}>{kind === 'pickup' ? 'PICKUP' : 'DROP'}</Text>
        <Text style={styles.stopTitle}>{title}</Text>
        <Text style={styles.stopAddr}>{address}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Navigate to ${kind}`} onPress={onNavigate} style={styles.navBtn}>
        <Text style={styles.navBtnText}>GPS</Text>
      </Pressable>
    </View>
  );
}

export function OpsAccessGate({
  detail,
  staffEmail,
  onRetry,
  onSignOut,
}: {
  detail?: string | null;
  staffEmail?: string;
  onRetry?: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.work}>
      <Text style={styles.kicker}>WORKPLACE</Text>
      <Text style={styles.workTitle}>This account is not assigned here</Text>
      <Text style={styles.workMeta}>
        {detail?.trim() ||
          'World Pharma staff apps only open for the partner email on this workplace — not a shopper account.'}
      </Text>
      {staffEmail ? <Text style={styles.stopAddr}>Staff login: {staffEmail}</Text> : null}
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry" style={styles.action} onPress={onRetry}>
          <Text style={styles.actionText}>Retry</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out" style={styles.navBtn} onPress={onSignOut}>
        <Text style={styles.navBtnText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

export function OpsGiantButton({
  label,
  onPress,
  tone = 'go',
}: {
  label: string;
  onPress: () => void;
  tone?: 'go' | 'warn' | 'idle';
}) {
  const bg = tone === 'warn' ? '#C53030' : tone === 'idle' ? LINE : ACCENT;
  const fg = tone === 'go' ? '#fff' : INK;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.giant, { backgroundColor: bg }]}>
      <Text style={[styles.giantText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAFC' },
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: NAVY,
  },
  accentRail: { height: 3, width: '100%' },
  brand: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  product: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2, letterSpacing: -0.3 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  body: { padding: 16, gap: 12, paddingBottom: 28 },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: LINE,
    backgroundColor: '#fff',
    paddingBottom: 10,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', minHeight: 44, justifyContent: 'center', gap: 4 },
  tabIndicator: { width: 18, height: 3, borderRadius: 2 },
  tabOn: { color: ACCENT, fontSize: 11, fontWeight: '800' },
  tabOff: { color: MUTED, fontSize: 11, fontWeight: '700' },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpi: {
    flex: 1,
    backgroundColor: PANEL,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: '#1A365D',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kpiValue: { color: NAVY, fontSize: 22, fontWeight: '800' },
  kpiLabel: { color: MUTED, fontSize: 11, fontWeight: '700', marginTop: 4 },
  work: {
    backgroundColor: PANEL,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: LINE,
    gap: 8,
    shadowColor: '#1A365D',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  workHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: MUTED, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  pill: {
    color: WARN,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  workTitle: { color: INK, fontSize: 17, fontWeight: '800' },
  workMeta: { color: MUTED, fontSize: 13, lineHeight: 18 },
  action: {
    marginTop: 6,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  stop: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: PANEL,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
  },
  stopMark: { width: 10, height: 48, borderRadius: 6 },
  stopKind: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  stopTitle: { color: INK, fontSize: 16, fontWeight: '800', marginTop: 2 },
  stopAddr: { color: MUTED, fontSize: 13, marginTop: 2 },
  navBtn: {
    minWidth: 56,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: LINE,
  },
  navBtnText: { color: INK, fontWeight: '800', fontSize: 12 },
  giant: {
    minHeight: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giantText: { fontSize: 17, fontWeight: '800' },
});
