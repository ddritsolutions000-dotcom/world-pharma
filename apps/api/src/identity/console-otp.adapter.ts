import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactIdentifier } from '@world-pharma/shared';
import { AppEnv } from '@world-pharma/config';
import { OtpAdapter, OtpDispatch } from './otp.adapter';

@Injectable()
export class ConsoleOtpAdapter extends OtpAdapter {
  private readonly logger = new Logger(ConsoleOtpAdapter.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    super();
  }

  async send(dispatch: OtpDispatch, code: string): Promise<void> {
    const redacted = redactIdentifier(
      dispatch.destination,
      dispatch.channel === 'EMAIL' ? 'EMAIL' : 'PHONE',
    );
    const reveal = this.config.get('AUTH_DEV_REVEAL_OTP', { infer: true });
    const env = this.config.get('NODE_ENV', { infer: true });
    if (reveal && env !== 'production') {
      this.logger.log(
        `OTP dispatch challenge=${dispatch.challengeId} to=${redacted} purpose=${dispatch.purpose} code=${code}`,
      );
      return;
    }
    this.logger.log(
      `OTP dispatch challenge=${dispatch.challengeId} to=${redacted} purpose=${dispatch.purpose}`,
    );
  }
}
