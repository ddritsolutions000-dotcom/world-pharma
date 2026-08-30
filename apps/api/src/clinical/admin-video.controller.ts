import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { VideoService } from './video.service';

@Controller('admin/video-sessions')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminVideoController {
  constructor(private readonly video: VideoService) {}

  @Get()
  @RequirePermissions('video:read')
  list(@CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.video.adminList();
  }

  @Get(':id')
  @RequirePermissions('video:read')
  get(@Param('id') id: string, @CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.video.adminGet(id);
  }

  private assertAdmin(principal: Principal) {
    if (principal.audience !== 'admin') {
      throw Errors.forbidden('Admin session required');
    }
  }
}
