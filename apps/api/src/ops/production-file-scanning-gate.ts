/**
 * Sprint 47 — Production malware / file scanning gate.
 * Do not treat sandbox AllowAll/noop as a live security control.
 */
import { Errors } from '../common/problem';
import {
  isLiveFileScanningEnabled,
  isMockScannerProvider,
  readFileScanningEnvironment,
} from './infra-environment';

export type ProductionFileScanningBlocker =
  | 'PRODUCTION_ENVIRONMENT_NOT_SET'
  | 'FILE_SCANNING_LIVE_DISABLED'
  | 'MOCK_SCANNER_PRODUCTION_FORBIDDEN'
  | 'SCANNER_CONFIG_MISSING'
  | 'NO_PRODUCTION_SCANNER_ADAPTER';

export type ProductionFileScanningAvailability = {
  available: boolean;
  environment: 'sandbox' | 'production';
  provider: string | null;
  blockers: ProductionFileScanningBlocker[];
  message: string;
  never_trust_unscanned: true;
};

export function evaluateProductionFileScanningAvailable(): ProductionFileScanningAvailability {
  const blockers: ProductionFileScanningBlocker[] = [];
  const env = readFileScanningEnvironment();
  const provider = process.env['MALWARE_SCANNER_PROVIDER']?.trim() || null;
  if (env !== 'production') {
    blockers.push('PRODUCTION_ENVIRONMENT_NOT_SET');
  }
  if (!isLiveFileScanningEnabled()) {
    blockers.push('FILE_SCANNING_LIVE_DISABLED');
  }
  if (isMockScannerProvider(provider) || !provider) {
    blockers.push('MOCK_SCANNER_PRODUCTION_FORBIDDEN');
  }
  if (!process.env['MALWARE_SCANNER_ENDPOINT_REF']?.trim()) {
    blockers.push('SCANNER_CONFIG_MISSING');
  }
  blockers.push('NO_PRODUCTION_SCANNER_ADAPTER');
  const unique = [...new Set(blockers)];
  return {
    available: unique.length === 0,
    environment: env,
    provider,
    blockers: unique,
    message:
      unique.length === 0
        ? 'Production file scanning is available.'
        : `Production file scanning blocked: ${unique.join(', ')}`,
    never_trust_unscanned: true,
  };
}

export function assertProductionFileScanningAvailable(): ProductionFileScanningAvailability {
  const result = evaluateProductionFileScanningAvailable();
  if (result.available) {
    return result;
  }
  throw Errors.problem(
    409,
    result.blockers[0] ?? 'NO_PRODUCTION_SCANNER_ADAPTER',
    'Production file scanning unavailable',
    result.message,
  );
}
