declare module 'react-native' {
  import type { ReactNode } from 'react';

  export type ViewStyle = Record<string, string | number | undefined | boolean>;
  export type TextStyle = ViewStyle;
  export type ImageStyle = ViewStyle;

  type StyleProp<T> = T | T[] | false | null | undefined;

  export const View: (props: {
    key?: string | number;
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    accessibilityRole?: string;
  }) => React.JSX.Element;

  export const Text: (props: {
    key?: string | number;
    style?: StyleProp<TextStyle>;
    children?: ReactNode;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    numberOfLines?: number;
  }) => React.JSX.Element;

  export const Pressable: (props: {
    key?: string | number;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { disabled?: boolean; busy?: boolean; checked?: boolean };
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
  }) => React.JSX.Element;

  export const TextInput: (props: {
    key?: string | number;
    value?: string;
    onChangeText?: (value: string) => void;
    secureTextEntry?: boolean;
    accessibilityLabel?: string;
    placeholder?: string;
    placeholderTextColor?: string;
    style?: StyleProp<TextStyle>;
  }) => React.JSX.Element;

  export const ScrollView: (props: {
    key?: string | number;
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    horizontal?: boolean;
    showsHorizontalScrollIndicator?: boolean;
    keyboardShouldPersistTaps?: 'always' | 'never' | 'handled' | string;
  }) => React.JSX.Element;

  export const Image: (props: {
    key?: string | number;
    source: { uri: string } | number;
    style?: StyleProp<ImageStyle>;
    accessibilityLabel?: string;
    resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center' | string;
  }) => React.JSX.Element;

  export const StyleSheet: {
    create: <T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(styles: T) => T;
  };

  export const Platform: {
    OS: 'ios' | 'android' | 'web';
    select: <T>(spec: { ios?: T; android?: T; default?: T }) => T;
  };

  export const AccessibilityInfo: {
    isReduceMotionEnabled: () => Promise<boolean>;
    addEventListener: (event: string, handler: (value: boolean) => void) => { remove: () => void };
  };

  export const useColorScheme: () => 'light' | 'dark' | null;

  export const KeyboardAvoidingView: (props: {
    key?: string | number;
    style?: StyleProp<ViewStyle>;
    behavior?: 'height' | 'position' | 'padding';
    children?: ReactNode;
  }) => React.JSX.Element;

  export const SafeAreaView: (props: {
    style?: StyleProp<ViewStyle>;
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => React.JSX.Element;

  export const AppRegistry: {
    registerComponent: (name: string, factory: () => unknown) => void;
  };

  export const Linking: {
    getInitialURL: () => Promise<string | null>;
    addEventListener: (
      type: 'url',
      handler: (event: { url: string }) => void,
    ) => { remove: () => void };
  };
}
