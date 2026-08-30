import { SetMetadata } from '@nestjs/common';
import type { JwtAudience } from '@prisma/client';

export const AUDIENCES_KEY = 'identity:audiences';

export const RequireAudiences = (...audiences: JwtAudience[]) => SetMetadata(AUDIENCES_KEY, audiences);
