import { Injectable } from '@nestjs/common';
import {
  readRuntimeSecretEnvironment,
  resolveSecretReference,
  type SecretCaller,
  type SecretReference,
} from '../ops/secrets-manager-runtime-resolver';

/**
 * Legacy env lookup — sandbox/dev only.
 * Production must use SecretsManagerAdapter via resolveSecretReference.
 */
export abstract class SecretProvider {
  abstract get(name: string): string | undefined;
}

@Injectable()
export class EnvSecretProvider extends SecretProvider {
  get(name: string): string | undefined {
    if (readRuntimeSecretEnvironment() === 'production') {
      // Never silently serve process.env secrets in production.
      return undefined;
    }
    return process.env[name];
  }
}

/**
 * Nest-friendly facade around the S142 resolver.
 * Callers must not return resolved values to Admin/clients.
 */
@Injectable()
export class SecretsManagerRuntimeService {
  async resolve(ref: SecretReference, caller: SecretCaller) {
    return resolveSecretReference(ref, caller);
  }
}
