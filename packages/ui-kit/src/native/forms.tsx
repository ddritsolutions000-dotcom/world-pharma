import { Text, TextInput, View } from 'react-native';
import { nativeColors, nativeRadius, nativeTouch, type ColorMode } from './theme';

export type NativeInputProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  secure?: boolean;
  placeholder?: string;
  mode?: ColorMode;
  key?: string | number;
};

export function NativeInput({
  label,
  value,
  onChangeText,
  error,
  secure,
  placeholder,
  mode = 'light',
}: NativeInputProps) {
  const color = nativeColors(mode);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: color.text.secondary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        accessibilityLabel={label}
        placeholderTextColor={color.text.muted}
        style={{
          minHeight: nativeTouch,
          borderWidth: 1,
          borderColor: error ? color.status.error : color.border.default,
          borderRadius: nativeRadius.md,
          paddingHorizontal: 14,
          color: color.text.primary,
          backgroundColor: color.background.sunken,
          fontSize: 16,
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: color.status.error, marginTop: 2, fontSize: 12 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
