import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeInput } from '@world-pharma/ui-kit/native';
import { WorldPharmaMark, WorldPharmaWordmark } from './brand-mark';

/** Customer mobile auth — board navy/teal, not website coral. */
const NAVY = '#1A365D';
const TEAL = '#0D9488';
const SHEET = '#F7FAFC';
const INK = '#1A202C';
const MUTED = '#718096';
const LINE = '#E2E8F0';

type AuthFormProps = {
  email: string;
  otpCode: string;
  challengeId: string | null;
  loading: boolean;
  error: string | null;
  onEmail: (value: string) => void;
  onOtp: (value: string) => void;
  onSendOtp: () => void;
  onVerify: () => void;
  onClearError: () => void;
};

/** Board onboarding: illustration + brand + Get Started. */
export function AuthWelcomeScreen({
  onSignIn,
  onSignUp,
  onBrowse,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
  onBrowse: () => void;
}) {
  return (
    <SafeAreaView style={styles.onboardRoot} accessibilityLabel="Onboarding">
      <View style={styles.onboardArt}>
        <WorldPharmaMark size={88} />
        <Text style={styles.onboardArtCaption}>🩺 💊 🧪</Text>
      </View>
      <View style={styles.onboardBody}>
        <WorldPharmaWordmark light={false} size="lg" />
        <Text style={styles.onboardTitle}>Your Health Hub</Text>
        <Text style={styles.onboardSub}>
          Medicines, lab tests, scans, and doctors — manage care in one World-Pharma™ app.
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Get Started" style={styles.primaryBtn} onPress={onBrowse}>
          <Text style={styles.primaryBtnText}>Get Started</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Sign in" style={styles.secondaryBtn} onPress={onSignIn}>
          <Text style={styles.secondaryBtnText}>Sign in</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Create account" onPress={onSignUp}>
          <Text style={styles.ghostLink}>Create account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function AuthSignInScreen({
  onBack,
  onGoSignUp,
  ...form
}: AuthFormProps & { onBack: () => void; onGoSignUp: () => void }) {
  return (
    <AuthFormShell
      title="Welcome back"
      subtitle="Sign in with email. We send a one-time code — no password."
      ctaIdle="Send sign-in code"
      ctaVerify="Verify and sign in"
      switchPrompt="New here?"
      switchLabel="Create account"
      onSwitch={onGoSignUp}
      onBack={onBack}
      form={form}
    />
  );
}

export function AuthSignUpScreen({
  displayName,
  onDisplayName,
  onBack,
  onGoSignIn,
  ...form
}: AuthFormProps & {
  displayName: string;
  onDisplayName: (value: string) => void;
  onBack: () => void;
  onGoSignIn: () => void;
}) {
  return (
    <AuthFormShell
      title="Create your account"
      subtitle="Enter your name and email. We’ll send a code to verify it’s you."
      extraField={<NativeInput label="Full name" value={displayName} onChangeText={onDisplayName} placeholder="As on prescriptions" />}
      ctaIdle="Send sign-up code"
      ctaVerify="Verify and create account"
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      onSwitch={onGoSignIn}
      onBack={onBack}
      form={form}
    />
  );
}

function AuthFormShell({
  title,
  subtitle,
  extraField,
  ctaIdle,
  ctaVerify,
  switchPrompt,
  switchLabel,
  onSwitch,
  onBack,
  form,
}: {
  title: string;
  subtitle: string;
  extraField?: ReactNode;
  ctaIdle: string;
  ctaVerify: string;
  switchPrompt: string;
  switchLabel: string;
  onSwitch: () => void;
  onBack: () => void;
  form: AuthFormProps;
}) {
  return (
    <SafeAreaView style={styles.authRoot} accessibilityLabel={title}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <WorldPharmaMark size={48} />
          <Text style={styles.formTitle}>{title}</Text>
          <Text style={styles.formSub}>{subtitle}</Text>
          <View style={styles.card}>
            {extraField}
            <NativeInput label="Email" value={form.email} onChangeText={form.onEmail} placeholder="you@email.com" />
            {form.challengeId ? <NativeInput label="One-time code" value={form.otpCode} onChangeText={form.onOtp} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={form.challengeId ? ctaVerify : ctaIdle}
              style={styles.primaryBtn}
              onPress={() => {
                if (form.challengeId) form.onVerify();
                else form.onSendOtp();
              }}
            >
              <Text style={styles.primaryBtnText}>{form.loading ? 'Please wait…' : form.challengeId ? ctaVerify : ctaIdle}</Text>
            </Pressable>
            {form.error ? (
              <Pressable accessibilityRole="button" onPress={form.onClearError}>
                <Text style={styles.error}>{form.error}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchMuted}>{switchPrompt} </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={switchLabel} onPress={onSwitch}>
              <Text style={styles.switchLink}>{switchLabel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  onboardRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
  onboardArt: {
    backgroundColor: '#E6FFFA',
    paddingTop: 56,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 16,
  },
  onboardArtCaption: {
    fontSize: 28,
    letterSpacing: 8,
  },
  onboardBody: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 12,
  },
  onboardTitle: {
    color: NAVY,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  onboardSub: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  authRoot: {
    flex: 1,
    backgroundColor: NAVY,
  },
  formScroll: {
    padding: 24,
    gap: 14,
    flexGrow: 1,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    color: TEAL,
    fontSize: 16,
    fontWeight: '600',
  },
  formTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  formSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: SHEET,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    marginTop: 8,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: LINE,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: INK,
    fontSize: 16,
    fontWeight: '700',
  },
  ghostLink: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 10,
  },
  switchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingTop: 8,
  },
  switchMuted: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
  },
  switchLink: {
    color: TEAL,
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    color: '#C53030',
    fontSize: 13,
    fontWeight: '600',
  },
});
