import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { requestOtp, verifyOtp, type Audience } from '@world-pharma/shell-core';
import { NativeInput } from './forms';

const NAVY = '#1A365D';
const TEAL = '#0D9488';
const SHEET = '#F7FAFC';
const INK = '#1A202C';
const MUTED = '#718096';
const LINE = '#E2E8F0';

export function NativePageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 6, marginBottom: 4 }}>
      <Text style={chrome.title}>{title}</Text>
      {subtitle ? <Text style={chrome.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function NativeListSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={chrome.sectionTitle}>{title}</Text>
      <View style={chrome.sectionBody}>{children}</View>
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={chrome.row}>
      <View style={{ flex: 1 }}>
        <Text style={chrome.rowLabel}>{label}</Text>
        {hint ? <Text style={chrome.rowHint}>{hint}</Text> : null}
      </View>
      <Text style={chrome.chevron}>›</Text>
    </Pressable>
  );
}

export function NativeOtpSignIn({
  portalTitle,
  portalDescription,
  audience,
  staffEmail,
  applyHint = 'New here? Apply as a partner on the web first. After approval, sign in on this app.',
  onAuthenticated,
}: {
  portalTitle: string;
  portalDescription?: string;
  audience: Audience;
  staffEmail?: string;
  applyHint?: string;
  onAuthenticated: (tokens: { accessToken: string; refreshToken: string }) => void;
}) {
  const [phase, setPhase] = useState<'welcome' | 'sign-in'>('welcome');
  const [email, setEmail] = useState(staffEmail ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestOtp(email, 'LOGIN');
      setChallengeId(result.challengeId);
      if (result.devCode) {
        setOtpCode(result.devCode);
      }
    } catch {
      setError('Could not send OTP.');
    } finally {
      setBusy(false);
    }
  };

  const verifySignIn = async () => {
    if (!challengeId) {
      await sendOtp();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await verifyOtp(challengeId, otpCode, audience);
      onAuthenticated({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    } catch {
      setError('Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'welcome') {
    return (
      <SafeAreaView style={styles.root} accessibilityLabel={portalTitle}>
        <View style={styles.hero}>
          <View style={styles.mark}>
            <Text style={styles.markLetter}>W</Text>
          </View>
          <Text style={styles.heroTitle}>{portalTitle}</Text>
          <Text style={styles.heroSub}>{portalDescription ?? 'Staff tools for World Pharma operations.'}</Text>
        </View>
        <View style={styles.sheet}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={styles.primaryBtn}
            onPress={() => {
              setChallengeId(null);
              setOtpCode('');
              setError(null);
              setPhase('sign-in');
            }}
          >
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
          <Text style={styles.applyHint}>{applyHint}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} accessibilityLabel="Sign in">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => setPhase('welcome')}
            style={styles.back}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.formTitle}>Staff sign in</Text>
          <Text style={styles.formSub}>
            Use the workplace email for this app. Shopper / customer accounts are rejected after login.
          </Text>
          {staffEmail ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Use staff email ${staffEmail}`}
              onPress={() => setEmail(staffEmail)}
            >
              <Text style={styles.staffHint}>Workplace account · {staffEmail}</Text>
            </Pressable>
          ) : null}
          <View style={styles.card}>
            <NativeInput label="Work email" value={email} onChangeText={setEmail} placeholder={staffEmail ?? 'you@company.com'} />
            {challengeId ? <NativeInput label="One-time code" value={otpCode} onChangeText={setOtpCode} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={challengeId ? 'Verify and sign in' : 'Send sign-in code'}
              style={styles.primaryBtn}
              onPress={() => void (challengeId ? verifySignIn() : sendOtp())}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? 'Please wait…' : challengeId ? 'Verify and sign in' : 'Send sign-in code'}
              </Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  hero: { flex: 1, paddingHorizontal: 28, paddingTop: 48, justifyContent: 'center' },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  markLetter: { fontSize: 32, fontWeight: '800', color: '#fff' },
  heroTitle: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.6 },
  heroSub: { color: 'rgba(255,255,255,0.72)', fontSize: 17, lineHeight: 24, marginTop: 10, maxWidth: 300 },
  sheet: {
    backgroundColor: SHEET,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 12,
    paddingBottom: 32,
  },
  applyHint: { color: MUTED, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  formScroll: { padding: 24, gap: 14, flexGrow: 1 },
  back: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: TEAL, fontSize: 16, fontWeight: '600' },
  formTitle: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  formSub: { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 22 },
  staffHint: { color: TEAL, fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: SHEET, borderRadius: 20, padding: 18, gap: 14, marginTop: 8 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: TEAL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  error: { color: '#B42318', fontSize: 13, fontWeight: '600' },
});

const chrome = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: INK, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 21, color: MUTED },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 4,
  },
  sectionBody: {
    backgroundColor: '#fff',
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
  rowLabel: { fontSize: 16, fontWeight: '700', color: INK },
  rowHint: { fontSize: 13, color: MUTED, marginTop: 2 },
  chevron: { fontSize: 22, color: MUTED },
});
