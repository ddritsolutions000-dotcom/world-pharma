import { Module } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { AuthController } from './auth.controller';
import { CompanyAuthorityController } from './company-authority.controller';
import { SecurityEventsController } from './security-events.controller';
import { CompanyAuthorityService } from './company-authority.service';
import { AuthService } from './auth.service';
import { ConsoleOtpAdapter } from './console-otp.adapter';
import { AudienceGuard } from './audience.guard';
import { JwtAuthGuard } from './jwt.guard';
import { OtpAdapter } from './otp.adapter';
import { PermissionsGuard } from './permissions.guard';
import { RateLimitService } from './rate-limit.service';
import { RbacService } from './rbac.service';
import { SecurityEventsService } from './security-events.service';
import { SessionService } from './session.service';
import { MetricsModule } from '../common/metrics.module';
import { EventsModule } from '../events/events.module';
import { TokenService } from './token.service';

@Module({
  imports: [EventsModule, MetricsModule],
  controllers: [AuthController, CompanyAuthorityController, SecurityEventsController],
  providers: [
    PrismaService,
    RedisService,
    AuthService,
    SessionService,
    TokenService,
    RbacService,
    CompanyAuthorityService,
    SecurityEventsService,
    RateLimitService,
    JwtAuthGuard,
    AudienceGuard,
    PermissionsGuard,
    { provide: OtpAdapter, useClass: ConsoleOtpAdapter },
  ],
  exports: [
    JwtAuthGuard,
    AudienceGuard,
    PermissionsGuard,
    RbacService,
    TokenService,
    SecurityEventsService,
    CompanyAuthorityService,
  ],
})
export class IdentityModule {}
