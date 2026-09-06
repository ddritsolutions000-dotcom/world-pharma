import type { ReactNode } from 'react';
import { Text, type TextStyle } from 'react-native';
import { nativeColors, type ColorMode } from './theme';

export type NativeTextVariant = 'body' | 'bodySm' | 'caption' | 'h1' | 'h2' | 'h3' | 'label';

export type NativeTextProps = {
  children?: ReactNode;
  mode?: ColorMode;
  tone?: 'primary' | 'secondary' | 'muted';
  variant?: NativeTextVariant;
  style?: TextStyle;
  numberOfLines?: number;
  key?: string | number;
};

const SIZE: Record<NativeTextVariant, number> = {
  h1: 30,
  h2: 22,
  h3: 18,
  body: 16,
  bodySm: 15,
  label: 14,
  caption: 13,
};

export function NativeText({
  children,
  mode = 'light',
  tone = 'primary',
  variant = 'body',
  style,
  numberOfLines,
}: NativeTextProps) {
  const color = nativeColors(mode);
  const fg =
    tone === 'muted' ? color.text.muted : tone === 'secondary' ? color.text.secondary : color.text.primary;
  const size = SIZE[variant];
  const weight = variant === 'h1' || variant === 'h2' || variant === 'h3' || variant === 'label' ? '700' : '500';
  const baseStyle = {
    color: fg,
    fontSize: size,
    lineHeight: Math.round(size * (variant === 'h1' ? 1.2 : 1.4)),
    fontWeight: weight,
    letterSpacing: variant === 'h1' ? -0.4 : 0,
  };
  return (
    <Text numberOfLines={numberOfLines} style={style ? [baseStyle, style] : baseStyle}>
      {children}
    </Text>
  );
}
