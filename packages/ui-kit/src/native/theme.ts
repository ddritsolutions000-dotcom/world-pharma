import { Platform } from 'react-native';
import { darkColor, lightColor, space, type ColorMode, type SemanticColor } from '../tokens';

export type { ColorMode, SemanticColor };

export function nativeColors(mode: ColorMode): SemanticColor {
  return mode === 'dark' ? darkColor : lightColor;
}

export function nativeSpace(step: keyof typeof space): number {
  return space[step];
}

export const nativeTouch = 48;

export const nativeRadius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const nativeCanvas = '#F2F5F4';

export function nativeShadow() {
  return Platform.select({
    web: { boxShadow: '0 12px 32px rgba(18, 32, 42, 0.08)' },
    default: {
      shadowColor: '#12202A',
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
  });
}

export const reducedMotionHint =
  'Honor AccessibilityInfo.isReduceMotionEnabled and skip non-essential transitions.';
