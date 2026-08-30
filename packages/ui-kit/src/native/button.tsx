import { Pressable, Text } from 'react-native';
import { nativeColors, nativeTouch, type ColorMode } from './theme';

export function NativeButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  mode = 'light',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  mode?: ColorMode;
}) {
  const color = nativeColors(mode);
  const background =
    variant === 'primary' ? color.action.primary : variant === 'danger' ? color.action.danger : color.background.surface;
  const fg = variant === 'secondary' ? color.text.primary : variant === 'danger' ? color.action.onDanger : color.action.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={{
        minHeight: nativeTouch,
        minWidth: nativeTouch,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
        opacity: disabled ? 0.48 : 1,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: color.border.default,
      }}
    >
      <Text style={{ color: fg, fontWeight: '600' }}>{loading ? 'Working…' : label}</Text>
    </Pressable>
  );
}
