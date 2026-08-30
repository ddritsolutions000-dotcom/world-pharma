import { Injectable } from '@nestjs/common';

export abstract class SecretProvider {
  abstract get(name: string): string | undefined;
}

@Injectable()
export class EnvSecretProvider extends SecretProvider {
  get(name: string): string | undefined {
    return process.env[name];
  }
}
