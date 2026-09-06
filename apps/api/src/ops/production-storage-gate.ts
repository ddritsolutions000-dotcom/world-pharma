/**
 * Sprint 47 — Production private object storage gate.
 * Never writes production objects to local application disk.
 */
import { Errors } from '../common/problem';
import {
  isLiveObjectStorageEnabled,
  isLocalDiskStorageBackend,
  readObjectStorageEnvironment,
} from './infra-environment';

export type ProductionStorageBlocker =
  | 'PRODUCTION_ENVIRONMENT_NOT_SET'
  | 'OBJECT_STORAGE_LIVE_DISABLED'
  | 'LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN'
  | 'OBJECT_STORAGE_CONFIG_MISSING'
  | 'NO_PRODUCTION_STORAGE_ADAPTER';

export type ProductionStorageAvailability = {
  available: boolean;
  environment: 'sandbox' | 'production';
  backend: string;
  blockers: ProductionStorageBlocker[];
  message: string;
  never_fallback_to_local_disk: true;
};

export function evaluateProductionStorageAvailable(): ProductionStorageAvailability {
  const blockers: ProductionStorageBlocker[] = [];
  const env = readObjectStorageEnvironment();
  const backend = process.env['OBJECT_STORAGE_BACKEND']?.trim() || 'LOCAL';
  if (env !== 'production') {
    blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
  }
  if (!isLiveObjectStorageEnabled()) {
    blockers.push('OBJECT_STORAGE_LIVE_DISABLED');
  }
  if (isLocalDiskStorageBackend(backend)) {
    blockers.push('LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN');
  }
  if (!process.env['OBJECT_STORAGE_BUCKET_REF']?.trim() || !process.env['OBJECT_STORAGE_SECRET_REF']?.trim()) {
    blockers.push('OBJECT_STORAGE_CONFIG_MISSING');
  }
  blockers.push('NO_PRODUCTION_STORAGE_ADAPTER');
  const unique = [...new Set(blockers)];
  return {
    available: unique.length === 0,
    environment: env,
    backend,
    blockers: unique,
    message:
      unique.length === 0
        ? 'Production object storage is available.'
        : `Production object storage blocked: ${unique.join(', ')}`,
    never_fallback_to_local_disk: true,
  };
}

export function assertProductionStorageAvailable(): ProductionStorageAvailability {
  const result = evaluateProductionStorageAvailable();
  if (result.available) {
    return result;
  }
  throw Errors.problem(
    409,
    result.blockers[0] ?? 'NO_PRODUCTION_STORAGE_ADAPTER',
    'Production storage unavailable',
    result.message,
  );
}
