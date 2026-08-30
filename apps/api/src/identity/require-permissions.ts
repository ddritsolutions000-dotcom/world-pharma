import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from './permissions.guard';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
