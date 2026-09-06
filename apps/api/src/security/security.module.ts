import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpObservabilityInterceptor } from '../common/http.interceptor';
import { MetricsModule } from '../common/metrics.module';
import { PrismaService } from '../app/prisma.service';
import { IdentityModule } from '../identity/identity.module';
import { AbuseService } from './abuse.service';
import { EnvSecretProvider, SecretProvider, SecretsManagerRuntimeService } from './secrets';

@Global()
@Module({
  imports: [MetricsModule, IdentityModule],
  providers: [
    PrismaService,
    AbuseService,
    SecretsManagerRuntimeService,
    { provide: SecretProvider, useClass: EnvSecretProvider },
    { provide: APP_INTERCEPTOR, useClass: HttpObservabilityInterceptor },
  ],
  exports: [AbuseService, SecretProvider, SecretsManagerRuntimeService],
})
export class SecurityModule {}
