import { Text, View } from 'react-native';
import { NativeButton } from './button';
import { nativeColors, type ColorMode } from './theme';

export function NativeLoadingState({ title = 'Loading', mode = 'light' }: { title?: string; mode?: ColorMode }) {
  const color = nativeColors(mode);
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }} accessibilityRole="progressbar">
      <Text style={{ color: color.text.primary, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </View>
  );
}

export function NativePermissionDeniedState({
  title = 'Access denied',
  description = 'You do not have permission to view this.',
  mode = 'light',
}: {
  title?: string;
  description?: string;
  mode?: ColorMode;
}) {
  return <NativeEmptyState title={title} description={description} mode={mode} />;
}

export function NativeSessionExpiredState({
  onAction,
  mode = 'light',
}: {
  onAction?: () => void;
  mode?: ColorMode;
}) {
  return (
    <NativeEmptyState
      title="Session expired"
      description="Sign in again to continue."
      actionLabel="Sign in again"
      onAction={onAction}
      mode={mode}
    />
  );
}

export function NativeNetworkErrorState({
  description = 'Check your connection and try again.',
  onRetry,
  mode = 'light',
}: {
  description?: string;
  onRetry?: () => void;
  mode?: ColorMode;
}) {
  return (
    <NativeEmptyState
      title="Connection problem"
      description={description}
      actionLabel="Retry"
      onAction={onRetry}
      mode={mode}
    />
  );
}

export function NativeEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  mode = 'light',
}: {
  title: string;
  description: string;
  action?: never;
  actionLabel?: string;
  onAction?: () => void;
  mode?: ColorMode;
}) {
  const color = nativeColors(mode);
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 12 }}>
      <Text style={{ color: color.text.primary, fontSize: 18, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: color.text.secondary, textAlign: 'center' }}>{description}</Text>
      {actionLabel && onAction ? <NativeButton label={actionLabel} onPress={onAction} mode={mode} /> : null}
    </View>
  );
}
