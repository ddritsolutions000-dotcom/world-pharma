declare module 'react' {
  export type ReactNode = unknown;
  export const Fragment: unique symbol;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;
  export type SetStateAction<T> = T | ((prevState: T) => T);
  export function useState<T>(initial: T): [T, (value: SetStateAction<T>) => void];
  export function useCallback<T extends (...args: never[]) => unknown>(factory: T, deps: unknown[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
}

declare module 'react/jsx-runtime';

declare module 'expo' {
  export function registerRootComponent(component: unknown): void;
}

declare module 'expo-constants' {
  const Constants: {
    expoConfig?: { hostUri?: string | null } | null;
    linkingUri?: string | null;
  };
  export default Constants;
}

declare module 'expo-document-picker' {
  export function getDocumentAsync(options?: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    base64?: boolean;
    multiple?: boolean;
  }): Promise<{
    canceled: boolean;
    assets?: Array<{
      name: string;
      mimeType?: string;
      size?: number;
      uri: string;
      base64?: string;
    }>;
  }>;
}
