import { Text, View } from 'react-native';
import { nativeColors, type ColorMode } from './theme';

export function NativeCard({ children, mode = 'light' }: { children: React.ReactNode; mode?: ColorMode }) {
  const color = nativeColors(mode);
  return (
    <View
      style={{
        backgroundColor: color.background.surface,
        borderColor: color.border.default,
        borderWidth: 1,
        borderRadius: 8,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

export function NativeBadge({
  label,
  mode = 'light',
}: {
  label: string;
  mode?: ColorMode;
}) {
  const color = nativeColors(mode);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: color.clinical.rxBg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: color.clinical.rx, fontSize: 12 }}>{label}</Text>
    </View>
  );
}
