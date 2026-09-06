import { StyleSheet, Text, View } from 'react-native';

const NAVY = '#1A365D';
const TEAL = '#0D9488';
const MINT = '#7DDBB0';

/** Globe mark matching the customer web brand (navy / teal / mint). */
export function WorldPharmaMark({ size = 72 }: { size?: number }) {
  const ring = size * 0.12;
  const core = size * 0.22;
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.equator, { width: size * 0.78, height: size * 0.34, borderRadius: size * 0.2 }]} />
      <View style={[styles.meridian, { width: ring, height: size * 0.7 }]} />
      <View style={[styles.core, { width: core, height: core, borderRadius: core / 2 }]} />
    </View>
  );
}

export function WorldPharmaWordmark({ light = true, size = 'lg' }: { light?: boolean; size?: 'lg' | 'md' }) {
  const titleSize = size === 'lg' ? 28 : 20;
  return (
    <View style={styles.wordmark}>
      <Text style={[styles.title, { color: light ? '#fff' : NAVY, fontSize: titleSize }]}>
        World-Pharma
        <Text style={{ color: TEAL }}>™</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: NAVY,
    borderColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  equator: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: MINT,
  },
  meridian: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  core: {
    backgroundColor: TEAL,
  },
  wordmark: {
    alignItems: 'center',
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
