import type { ApiCallResult } from '@world-pharma/shell-core';
import type { ViewState } from './navigation';

export function applyApiResult<T>(
  result: ApiCallResult<T>,
  handlers: {
    onOk: (data: T) => void;
    onUnauthorized?: () => void;
    setViewState: (state: ViewState) => void;
    onForbidden?: () => void;
    onError?: (message: string) => void;
  },
): boolean {
  if (result.ok) {
    handlers.onOk(result.data);
    return true;
  }
  if (result.kind === 'unauthorized') {
    handlers.onUnauthorized?.();
    return false;
  }
  if (result.kind === 'forbidden') {
    handlers.setViewState('forbidden');
    handlers.onForbidden?.();
    return false;
  }
  handlers.setViewState('network');
  handlers.onError?.(result.error);
  return false;
}
