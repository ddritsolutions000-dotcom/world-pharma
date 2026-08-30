import { Text } from 'react-native';
import { fontSize } from '../tokens';
import { nativeColors, type ColorMode } from './theme';

export function NativeText({
  children,
  mode = 'light',
  tone = 'primary',
  variant = 'body',
}: {
  children: string;
  mode?: ColorMode;
  tone?: 'primary' | 'secondary' | 'muted';
  variant?: 'body' | 'bodySm' | 'caption' | 'h1' | 'h2';
}) {
  const color = nativeColors(mode);
  const fg =
    tone === 'muted' ? color.text.muted : tone === 'secondary' ? color.text.secondary : color.text.primary;
  const size =
    variant === 'h1'
      ? fontSize.h1
      : variant === 'h2'
        ? fontSize.h2
        : variant === 'bodySm'
          ? fontSize.bodySm
          : variant === 'caption'
            ? fontSize.caption
            : fontSize.body;
  return <Text style={{ color: fg, fontSize: size, lineHeight: size * 1.45 }}>{children}</Text>;
}
