import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const NAVY = '#1A365D';
const INK = '#1A202C';
const MUTED = '#718096';
const LINE = '#E2E8F0';
const SHEET = '#FFFFFF';
const MINT = '#0D9488';

export function NativePageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function NativeGuestAuthCard({
  title = 'Your account lives here',
  body = 'Sign in to see orders, consults, prescriptions, and health records. New here? Create an account.',
  onSignIn,
  onSignUp,
}: {
  title?: string;
  body?: string;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  return (
    <View style={styles.guestCard}>
      <Text style={styles.guestTitle}>{title}</Text>
      <Text style={styles.guestBody}>{body}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign in" style={styles.primary} onPress={onSignIn}>
        <Text style={styles.primaryText}>Sign in</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Create account" style={styles.secondary} onPress={onSignUp}>
        <Text style={styles.secondaryText}>Create account</Text>
      </Pressable>
    </View>
  );
}

export function NativeListSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function NativeListRow({
  label,
  hint,
  onPress,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function NativeDoctorCard({
  name,
  specialty,
  online,
  onPress,
  actionLabel = 'View availability',
}: {
  name: string;
  specialty?: string;
  online?: boolean;
  onPress: () => void;
  actionLabel?: string;
}) {
  const initial = (name.trim()[0] ?? 'D').toUpperCase();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={name} onPress={onPress} style={styles.doctor}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLetter}>{initial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.doctorName}>{name}</Text>
        <Text style={styles.doctorMeta}>{specialty || 'General consult'}</Text>
        {online ? <Text style={styles.online}>Video consult available</Text> : null}
      </View>
      <Text style={styles.doctorCta}>{actionLabel}</Text>
    </Pressable>
  );
}

export function NativeFilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipOn : null]}
    >
      <Text style={active ? styles.chipOnText : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export function NativeTrackTimeline({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <View style={styles.timeline}>
      {steps.map((step, i) => (
        <View key={step} style={styles.timelineRow}>
          <View style={[styles.dot, i <= activeIndex ? styles.dotOn : null]} />
          <Text style={i <= activeIndex ? styles.timelineOn : styles.timelineOff}>{step.replaceAll('_', ' ')}</Text>
        </View>
      ))}
    </View>
  );
}

export function formatConsultWhen(iso?: string) {
  if (!iso) {
    return 'Time to be confirmed';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: MUTED,
  },
  guestCard: {
    backgroundColor: NAVY,
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  guestTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  guestBody: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    lineHeight: 20,
  },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  secondary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  sectionBody: {
    backgroundColor: SHEET,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LINE,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LINE,
    minHeight: 56,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: INK,
  },
  rowHint: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: MUTED,
  },
  doctor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SHEET,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '800',
    color: INK,
  },
  doctorMeta: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
  },
  online: {
    fontSize: 12,
    color: MINT,
    fontWeight: '700',
    marginTop: 4,
  },
  doctorCta: {
    fontSize: 12,
    fontWeight: '800',
    color: NAVY,
    maxWidth: 88,
    textAlign: 'right',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SHEET,
    borderWidth: 1,
    borderColor: LINE,
  },
  chipOn: {
    backgroundColor: NAVY,
    borderColor: NAVY,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: INK,
  },
  chipOnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  timeline: {
    gap: 10,
    paddingVertical: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: LINE,
  },
  dotOn: {
    backgroundColor: MINT,
  },
  timelineOn: {
    fontSize: 14,
    fontWeight: '700',
    color: INK,
    textTransform: 'capitalize',
  },
  timelineOff: {
    fontSize: 14,
    color: MUTED,
    textTransform: 'capitalize',
  },
});
