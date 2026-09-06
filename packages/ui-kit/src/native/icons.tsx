import { Text, View } from 'react-native';
import { nativeColors, nativeRadius } from './theme';

export type NativeIconSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const BOX: Record<NativeIconSize, number> = { sm: 36, md: 48, lg: 60, xl: 72, hero: 88 };
const GLYPH: Record<NativeIconSize, number> = { sm: 20, md: 26, lg: 32, xl: 38, hero: 44 };

export function NativeGlyph({
  glyph,
  size = 'lg',
  background,
  color,
}: {
  glyph: string;
  size?: NativeIconSize;
  background?: string;
  color?: string;
}) {
  const dim = BOX[size];
  const font = GLYPH[size];
  const palette = nativeColors('light');
  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: Math.round(dim * 0.3),
        backgroundColor: background ?? palette.background.sunken,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: font, lineHeight: font + 6, color: color ?? palette.text.primary }}>{glyph}</Text>
    </View>
  );
}

export function NativeLogoMark({ size = 'lg' }: { size?: NativeIconSize }) {
  const dim = BOX[size];
  const font = GLYPH[size];
  const color = nativeColors('light');
  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: nativeRadius.lg,
        backgroundColor: '#0D9488',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: color.action.onPrimary, fontSize: font, fontWeight: '800', lineHeight: font + 4 }}>+</Text>
    </View>
  );
}

export function NativeTabGlyph({ glyph, active }: { glyph: string; active: boolean }) {
  return (
    <Text
      style={{
        fontSize: 28,
        lineHeight: 34,
        color: active ? '#0F5C5A' : '#6B7C86',
      }}
    >
      {glyph}
    </Text>
  );
}
