import { Pressable, Text } from 'react-native';
import { nativeColors, nativeRadius, nativeTouch, type ColorMode } from './theme';

export type NativeButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  mode?: ColorMode;
  key?: string | number;
};

export function NativeButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  mode = 'light',
}: NativeButtonProps) {
  const color = nativeColors(mode);
  const background =
    variant === 'primary'
      ? color.action.primary
      : variant === 'danger'
        ? color.action.danger
        : variant === 'ghost'
          ? 'transparent'
          : color.background.surface;
  const fg =
    variant === 'secondary' || variant === 'ghost'
      ? color.text.primary
      : variant === 'danger'
        ? color.action.onDanger
        : color.action.onPrimary;
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
        paddingHorizontal: 18,
        borderRadius: nativeRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
        opacity: disabled ? 0.45 : 1,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: color.border.default,
      }}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15, letterSpacing: 0.2 }}>
        {loading ? 'Working…' : label}
      </Text>
    </Pressable>
  );
}
