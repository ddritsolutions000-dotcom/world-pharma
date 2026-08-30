import { Text, TextInput, View } from 'react-native';
import { nativeColors, nativeTouch, type ColorMode } from './theme';

export function NativeInput({
  label,
  value,
  onChangeText,
  error,
  secure,
  mode = 'light',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  secure?: boolean;
  mode?: ColorMode;
}) {
  const color = nativeColors(mode);
  return (
    <View>
      <Text style={{ color: color.text.primary, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        accessibilityLabel={label}
        placeholderTextColor={color.text.muted}
        style={{
          minHeight: nativeTouch,
          borderWidth: 1,
          borderColor: error ? color.status.error : color.border.default,
          borderRadius: 4,
          paddingHorizontal: 12,
          color: color.text.primary,
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: color.status.error, marginTop: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
