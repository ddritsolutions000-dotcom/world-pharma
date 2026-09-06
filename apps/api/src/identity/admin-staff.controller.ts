import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Errors } from '../common/problem';
import { AdminStaffService } from './admin-staff.service';
import { AudienceGuard } from './audience.guard';
import { CurrentPrincipal, type Principal } from './current-principal';
import { JwtAuthGuard } from './jwt.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequireAudiences } from './require-audiences';
import { RequirePermissions } from './require-permissions';
import { SessionService } from './session.service';

@Controller('admin/staff')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminStaffController {
  constructor(
    private readonly staff: AdminStaffService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @RequirePermissions('user:read')
  list(@Req() req: Request) {
    const url = new URL(req.originalUrl, 'http://local');
    return this.staff.list({
      search: url.searchParams.get('search') ?? undefined,
      role: url.searchParams.get('role') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    });
  }

  @Get(':personId')
  @RequirePermissions('user:read')
  get(@Param('personId') personId: string) {
    return this.staff.get(personId);
  }

  @Post('invitations')
  @HttpCode(200)
  @RequirePermissions('rbac:grant_company')
  invite(
    @Body() body: { email?: string; role_code?: string },
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    if (!body.email || !body.role_code) {
      throw Errors.validation('email and role_code are required');
    }
    return this.staff.invite({
      actorId: principal.personId,
      email: body.email,
      roleCode: body.role_code,
      requestId: req.header('x-request-id'),
    });
  }

  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvitation(@Body() body: { token?: string; email?: string }, @Req() req: Request) {
    if (!body.token || !body.email) {
      throw Errors.validation('token and email are required');
    }
    return this.staff.acceptInvitation({
      token: body.token,
      identifier: body.email,
      requestId: req.header('x-request-id'),
    });
  }

  @Patch(':personId/status')
  @RequirePermissions('rbac:grant_company')
  setStatus(
    @Param('personId') personId: string,
    @Body() body: { status?: 'ACTIVE' | 'DISABLED' },
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    if (body.status !== 'ACTIVE' && body.status !== 'DISABLED') {
      throw Errors.validation('status must be ACTIVE or DISABLED');
    }
    return this.staff.setAccountStatus({
      actorId: principal.personId,
      targetPersonId: personId,
      status: body.status,
      requestId: req.header('x-request-id'),
    });
  }

  @Patch(':personId/mfa-policy')
  @RequirePermissions('rbac:grant_company')
  setMfaPolicy(
    @Param('personId') personId: string,
    @Body() body: { required?: boolean },
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    if (typeof body.required !== 'boolean') {
      throw Errors.validation('required boolean is required');
    }
    return this.staff.setMfaRequired({
      actorId: principal.personId,
      targetPersonId: personId,
      required: body.required,
      requestId: req.header('x-request-id'),
    });
  }

  @Post(':personId/roles')
  @HttpCode(200)
  @RequirePermissions('rbac:grant_company')
  assignRole(
    @Param('personId') personId: string,
    @Body() body: { role_code?: string; reason?: string },
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    if (!body.role_code || !body.reason) {
      throw Errors.validation('role_code and reason are required');
    }
    return this.staff.assignRole({
      actorId: principal.personId,
      targetPersonId: personId,
      roleCode: body.role_code,
      reason: body.reason,
      requestId: req.header('x-request-id'),
    });
  }

  @Post(':personId/roles/remove')
  @HttpCode(200)
  @RequirePermissions('rbac:grant_company')
  removeRole(
    @Param('personId') personId: string,
    @Body() body: { role_code?: string },
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    if (!body.role_code) {
      throw Errors.validation('role_code is required');
    }
    return this.staff.removeRole({
      actorId: principal.personId,
      targetPersonId: personId,
      roleCode: body.role_code,
      requestId: req.header('x-request-id'),
    });
  }

  @Post(':personId/sessions/revoke-all')
  @HttpCode(200)
  @RequirePermissions('session:revoke')
  revokeSessions(
    @Param('personId') personId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    return this.staff.revokeAllSessions({
      actorId: principal.personId,
      targetPersonId: personId,
      requestId: req.header('x-request-id'),
    });
  }

  @Get(':personId/sessions')
  @RequirePermissions('session:revoke')
  listSessions(@Param('personId') personId: string) {
    return this.sessions.listForPerson(personId);
  }
}

@Controller()
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get('auth/sessions')
  @UseGuards(JwtAuthGuard)
  listOwn(@CurrentPrincipal() principal: Principal) {
    return this.sessions.listForPerson(principal.personId, principal.sessionId);
  }

  @Post('auth/sessions/:sessionId/revoke')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async revokeOwn(
    @Param('sessionId') sessionId: string,
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    await this.sessions.revokeSession(sessionId, principal.personId, req.header('x-request-id'));
    return { ok: true };
  }
}
