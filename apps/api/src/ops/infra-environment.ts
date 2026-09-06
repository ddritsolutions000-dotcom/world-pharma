/**
 * Sprint 47 — Production infrastructure / storage / scanning environment flags.
 * Live cloud backends require explicit enablement. Sandbox local disk remains default.
 */
export type InfraRuntimeEnvironment = 'sandbox' | 'production';

export function readInfrastructureEnvironment(): InfraRuntimeEnvironment {
  const raw = process.env['INFRASTRUCTURE_ENVIRONMENT']?.trim().toLowerCase();
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

export function readObjectStorageEnvironment(): InfraRuntimeEnvironment {
  const raw = process.env['OBJECT_STORAGE_ENVIRONMENT']?.trim().toLowerCase();
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

export function readFileScanningEnvironment(): InfraRuntimeEnvironment {
  const raw =
    process.env['FILE_SCANNING_ENVIRONMENT']?.trim().toLowerCase() ??
    process.env['MALWARE_SCANNER_ENVIRONMENT']?.trim().toLowerCase();
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

export function isLiveObjectStorageEnabled(): boolean {
  return process.env['OBJECT_STORAGE_LIVE_ENABLED'] === 'true';
}

export function isLiveFileScanningEnabled(): boolean {
  return (
    process.env['FILE_SCANNING_LIVE_ENABLED'] === 'true' || process.env['MALWARE_SCANNER_LIVE_ENABLED'] === 'true'
  );
}

export function isMockScannerProvider(provider: string | null | undefined): boolean {
  if (!provider) {
    return false;
  }
  const upper = provider.trim().toUpperCase();
  return upper === 'NOOP' || upper === 'MOCK' || upper === 'ALLOW_ALL' || upper.startsWith('SANDBOX');
}

export function isLocalDiskStorageBackend(backend: string | null | undefined): boolean {
  if (!backend) {
    return true;
  }
  const upper = backend.trim().toUpperCase();
  return upper === 'LOCAL' || upper === 'DISK' || upper === 'FILESYSTEM' || upper === 'SANDBOX';
}
