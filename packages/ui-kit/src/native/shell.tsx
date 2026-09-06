import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { NativeText } from './text';
import { NativeLogoMark } from './icons';
import { nativeCanvas, nativeColors, nativeRadius } from './theme';
export { NativeOtpSignIn, NativePageHeader, NativeListSection, NativeListRow } from './partner-auth';

export const nativeAppScreen = StyleSheet.create({
  root: { flex: 1, backgroundColor: nativeCanvas },
  body: { flex: 1, padding: 20, gap: 16, backgroundColor: nativeCanvas },
  segmentBar: {
    flexDirection: 'row',
    borderRadius: nativeRadius.md,
    backgroundColor: '#E7EEEC',
    padding: 4,
    gap: 4,
  },
  segment: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  segmentActive: {
    backgroundColor: '#ffffff',
  },
});

export function NativeAppScreen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={style ? [nativeAppScreen.root, style] : nativeAppScreen.root}>{children}</View>;
}

export function NativeBrandMark({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 6, alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <NativeLogoMark size="sm" />
        <NativeText variant="h2">{title}</NativeText>
      </View>
      {subtitle ? (
        <NativeText variant="caption" tone="secondary">
          {subtitle}
        </NativeText>
      ) : null}
    </View>
  );
}

export function NativeSegmentTabs<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onSelect: (id: T) => void;
}) {
  const color = nativeColors('light');
  const scroll = tabs.length > 4;
  const inner = (
    <View style={scroll ? { flexDirection: 'row', gap: 6 } : nativeAppScreen.segmentBar}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            style={
              scroll
                ? {
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: nativeRadius.pill,
                    backgroundColor: selected ? color.action.primary : color.background.surface,
                    borderWidth: selected ? 0 : 1,
                    borderColor: color.border.default,
                  }
                : selected
                  ? { ...nativeAppScreen.segment, ...nativeAppScreen.segmentActive, flex: 1 }
                  : { ...nativeAppScreen.segment, flex: 1 }
            }
            onPress={() => onSelect(tab.id)}
          >
            <NativeText
              variant="bodySm"
              style={selected && scroll ? { color: color.action.onPrimary, fontWeight: '700' } : { fontWeight: '700' }}
            >
              {tab.label}
            </NativeText>
          </Pressable>
        );
      })}
    </View>
  );
  if (!scroll) {
    return inner;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2 }}>
      {inner}
    </ScrollView>
  );
}

export function NativeShell({
  title,
  caption,
  tabs,
  activeTab,
  onSelectTab,
  children,
}: {
  title: string;
  caption?: string;
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onSelectTab: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <NativeAppScreen style={nativeAppScreen.body}>
      <NativeBrandMark title={title} subtitle={caption} />
      <NativeSegmentTabs tabs={tabs} active={activeTab} onSelect={onSelectTab} />
      <View style={{ flex: 1, gap: 12 }}>{children}</View>
    </NativeAppScreen>
  );
}
