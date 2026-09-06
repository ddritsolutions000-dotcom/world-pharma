import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { WorldPharmaMark, WorldPharmaWordmark } from './brand-mark';

const NAVY = '#1A365D';
const TEAL = '#0D9488';

/**
 * Board-style launch splash: full-bleed navy, globe mark, brand, slogan.
 * Shown once on cold start before welcome / home.
 */
export function CustomerSplashScreen({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
    ]).start();

    const hold = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onDone();
      });
    }, 1600);

    return () => clearTimeout(hold);
  }, [onDone, opacity, scale]);

  return (
    <View style={styles.root} accessibilityLabel="World-Pharma splash">
      <View style={styles.glow} />
      <Animated.View style={[styles.content, { opacity, transform: [{ scale }] }]}>
        <WorldPharmaMark size={88} />
        <WorldPharmaWordmark light size="lg" />
        <Text style={styles.slogan}>Health for People Everywhere.</Text>
        <Text style={styles.tagline}>Global Healthcare. For a Healthier Tomorrow.</Text>
      </Animated.View>
      <Text style={styles.footer}>Customer app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(13,148,136,0.18)',
  },
  content: {
    alignItems: 'center',
    gap: 14,
  },
  slogan: {
    marginTop: 8,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  tagline: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  footer: {
    position: 'absolute',
    bottom: 36,
    color: TEAL,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
