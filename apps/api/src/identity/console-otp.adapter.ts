import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactIdentifier } from '@world-pharma/shared';
import { AppEnv } from '@world-pharma/config';
import {
  OtpAdapter,
  OtpDispatch,
  OtpProviderHealth,
  OtpSendResult,
} from './otp.adapter';
import { readCommunicationEnvironment } from './communication.config';

/**
 * Sandbox OTP adapter — logs redacted destination only.
 * Never used for production traffic (production gate forbids CONSOLE/MOCK).
 */
@Injectable()
export class ConsoleOtpAdapter extends OtpAdapter {
  private readonly logger = new Logger(ConsoleOtpAdapter.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    super();
  }

  async send(dispatch: OtpDispatch, code: string): Promise<OtpSendResult> {
    const redacted = redactIdentifier(
      dispatch.destination,
      dispatch.channel === 'EMAIL' ? 'EMAIL' : 'PHONE',
    );
    const reveal = this.config.get('AUTH_DEV_REVEAL_OTP', { infer: true });
    const env = this.config.get('NODE_ENV', { infer: true });
    const comm = readCommunicationEnvironment();
    // Never log OTP plaintext when communication or NODE_ENV is production.
    const mayReveal = Boolean(reveal) && env !== 'production' && comm !== 'production';
    if (mayReveal) {
      this.logger.log(
        `OTP dispatch challenge=${dispatch.challengeId} to=${redacted} purpose=${dispatch.purpose} code=${code}`,
      );
    } else {
      this.logger.log(
        `OTP dispatch challenge=${dispatch.challengeId} to=${redacted} purpose=${dispatch.purpose}`,
      );
    }
    return {
      provider_ref: `console:${dispatch.challengeId}`,
      status: 'ACCEPTED',
      sandbox: true,
    };
  }

  async healthCheck(): Promise<OtpProviderHealth> {
    return {
      healthy: true,
      environment: readCommunicationEnvironment(),
      provider: 'CONSOLE',
      message: 'Sandbox console OTP adapter. Production OTP remains EXTERNAL_GATED.',
    };
  }
}
