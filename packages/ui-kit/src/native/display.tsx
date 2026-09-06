import type { ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { nativeColors, nativeRadius, nativeShadow, type ColorMode } from './theme';

export type NativeCardProps = {
  children?: ReactNode;
  mode?: ColorMode;
  key?: string | number;
  style?: ViewStyle;
};

export function NativeCard({ children, mode = 'light', style }: NativeCardProps) {
  const color = nativeColors(mode);
  const baseStyle = {
    backgroundColor: color.background.surface,
    borderColor: color.border.default,
    borderWidth: 1,
    borderRadius: nativeRadius.lg,
    padding: 16,
    gap: 10,
    ...nativeShadow(),
  };
  return <View style={style ? [baseStyle, style] : baseStyle}>{children}</View>;
}

export function NativeBadge({
  label,
  mode = 'light',
  key,
}: {
  label: string;
  mode?: ColorMode;
  key?: string | number;
}) {
  const color = nativeColors(mode);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: color.clinical.rxBg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: nativeRadius.pill,
      }}
    >
      <Text style={{ color: color.clinical.rx, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}
