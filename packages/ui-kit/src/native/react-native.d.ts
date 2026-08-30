declare module 'react-native' {
  import type { ReactNode } from 'react';
  export type ViewStyle = Record<string, string | number | undefined>;
  export type TextStyle = ViewStyle;
  export const View: (props: {
    key?: string | number;
    style?: ViewStyle | ViewStyle[];
    children?: ReactNode;
    accessibilityRole?: string;
  }) => React.JSX.Element;
  export const Text: (props: {
    key?: string | number;
    style?: TextStyle | TextStyle[];
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityRole?: string;
  }) => React.JSX.Element;
  export const Pressable: (props: {
    key?: string | number;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { disabled?: boolean; busy?: boolean; checked?: boolean };
    style?: ViewStyle | ViewStyle[];
    children?: ReactNode;
  }) => React.JSX.Element;
  export const TextInput: (props: Record<string, unknown>) => React.JSX.Element;
  export const ScrollView: (props: { children?: ReactNode; style?: ViewStyle; keyboardShouldPersistTaps?: string }) => React.JSX.Element;
  export const StyleSheet: { create: <T extends Record<string, ViewStyle | TextStyle>>(styles: T) => T };
  export const Platform: { OS: 'ios' | 'android' | 'web'; select: <T>(spec: { ios?: T; android?: T; default?: T }) => T };
  export const AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise<boolean>;
    addEventListener: (event: string, handler: (value: boolean) => void) => { remove: () => void };
  };
  export const useColorScheme: () => 'light' | 'dark' | null;
  export const SafeAreaView: (props: {
    style?: ViewStyle | ViewStyle[];
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => React.JSX.Element;
  export const AppRegistry: {
    registerComponent: (name: string, factory: () => unknown) => void;
  };
}
