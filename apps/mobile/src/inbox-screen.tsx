import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeBadge,
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import { NativePageHeader } from './native-screens';
import { applyApiResult } from './api-result';
import {
  fetchNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
  type InboxItem,
} from './account-api';
import {
  customerInboxDestination,
  formatInboxWhen,
  inboxCategoryLabel,
  inboxView,
} from './notification-inbox';
import type { MobileScreen, ViewState } from './navigation';

type InboxCtx = {
  token: string;
  onUnauthorized: () => void;
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
  onBack: () => void;
  signOut: () => void;
};

export function InboxScreen({
  ctx,
  onOpenDestination,
}: {
  ctx: InboxCtx;
  onOpenDestination: (target: import('./notification-inbox').InboxDestination) => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    const result = await fetchNotificationInbox({ token: ctx.token, onUnauthorized: ctx.onUnauthorized });
    applyApiResult(result, {
      onOk: (data) => setItems(data.data ?? []),
      onUnauthorized: ctx.onUnauthorized,
      setViewState: ctx.setViewState,
    });
    if (result.ok) {
      ctx.setViewState('idle');
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    setMarkingId(id);
    const result = await markNotificationRead({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      id,
    });
    setMarkingId(null);
    if (result.ok) {
      setItems(result.data.data ?? []);
      ctx.setViewState('idle');
    } else if (result.kind !== 'unauthorized') {
      ctx.setViewState('network');
    }
  }

  async function markAllRead() {
    setMarkingId('__all__');
    const result = await markAllNotificationsRead({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
    });
    setMarkingId(null);
    if (result.ok) {
      setItems(result.data.data ?? []);
      ctx.setViewState('idle');
    } else if (result.kind !== 'unauthorized') {
      ctx.setViewState('network');
    }
  }

  const view = inboxView(ctx.viewState, items);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativePageHeader
        title="Inbox"
        subtitle="Orders, appointments, and support — previews stay generic."
      />
      {view.unread.length > 0 ? (
        <NativeButton
          label={markingId === '__all__' ? 'Updating…' : 'Mark all as read'}
          variant="secondary"
          disabled={markingId !== null}
          onPress={() => void markAllRead()}
        />
      ) : null}
      {view.showLoading ? <NativeLoadingState title="Loading inbox" /> : null}
      {view.showNetwork ? <NativeNetworkErrorState onRetry={() => void load()} /> : null}
      {view.showForbidden ? <NativePermissionDeniedState /> : null}
      {view.showEmpty ? (
        <NativeEmptyState
          title="No notifications"
          description="Updates about orders, appointments, and support will appear here."
        />
      ) : null}
      {view.unread.map((item) => (
        <View key={item.id}>
          <InboxNativeCard
            item={item}
            busy={markingId === item.id}
            onMarkRead={(id) => void markRead(id)}
            onOpen={onOpenDestination}
          />
        </View>
      ))}
      {view.read.map((item) => (
        <View key={item.id}>
          <InboxNativeCard
            item={item}
            busy={markingId === item.id}
            onMarkRead={(id) => void markRead(id)}
            onOpen={onOpenDestination}
          />
        </View>
      ))}
    </View>
  );
}

function InboxNativeCard({
  item,
  busy,
  onMarkRead,
  onOpen,
}: {
  item: InboxItem;
  busy: boolean;
  onMarkRead: (id: string) => void;
  onOpen: (target: import('./notification-inbox').InboxDestination) => void;
}) {
  const destination = customerInboxDestination(item);
  const category = inboxCategoryLabel(item.reference_type);
  return (
    <View>
      <NativeCard>
        <NativeBadge label={item.read ? 'Read' : 'Unread'} />
        <NativeText variant="h2">{item.title}</NativeText>
        <NativeText>{item.body}</NativeText>
        <NativeText variant="caption">{`${formatInboxWhen(item.created_at)}${category ? ` · ${category}` : ''}`}</NativeText>
        {destination ? (
          <NativeButton label="Open" variant="secondary" onPress={() => onOpen(destination)} />
        ) : null}
        {!item.read ? (
          <NativeButton
            label={busy ? 'Updating…' : 'Mark as read'}
            variant="secondary"
            disabled={busy}
            onPress={() => onMarkRead(item.id)}
          />
        ) : null}
      </NativeCard>
    </View>
  );
}
