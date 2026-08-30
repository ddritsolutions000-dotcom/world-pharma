import { darkColor, lightColor, space, type ColorMode, type SemanticColor } from '../tokens';

export type { ColorMode, SemanticColor };

export function nativeColors(mode: ColorMode): SemanticColor {
  return mode === 'dark' ? darkColor : lightColor;
}

export function nativeSpace(step: keyof typeof space): number {
  return space[step];
}

export const nativeTouch = 44;

export const reducedMotionHint =
  'Honor AccessibilityInfo.isReduceMotionEnabled and skip non-essential transitions.';
