import { Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { minorJson } from '../catalog/money';
import { PolicyResolver } from '../policy/resolver';
import {
  computePartnerNet,
  resolvePartnerPlatformFeeBps,
  type PartnerFeeCommerce,
} from '../finance/partner-platform-fee';

type ConsultationFeeConfig = {
  fee_minor?: string | number;
  currency?: string;
  platform_fee_bps?: number;
};

@Injectable()
export class DoctorEarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
  ) {}

  private parseFeeConfig(raw: unknown, fallbackCurrency: string, defaultPlatformFeeBps: number) {
    const config = (raw ?? {}) as ConsultationFeeConfig;
    const feeMinor = BigInt(String(config.fee_minor ?? '0'));
    const currency = String(config.currency ?? fallbackCurrency ?? 'XXX').toUpperCase();
    const hasOverride =
      raw != null && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'platform_fee_bps');
    const platformFeeBps = hasOverride
      ? Math.max(0, Number(config.platform_fee_bps ?? 0))
      : defaultPlatformFeeBps;
    const breakdown = computePartnerNet({ grossMinor: feeMinor > 0n ? feeMinor : 0n, platformFeeBps });
    return {
      feeMinor,
      currency,
      platformFeeBps: breakdown.platformFeeBps,
      platformFeeMinor: breakdown.platformFeeMinor,
      doctorPayableMinor: breakdown.netMinor,
    };
  }

  private async requireDoctorProfile(personId: string) {
    const profile = await this.prisma.doctorProfile.findFirst({
      where: { personId },
      include: { country: true, partner: true },
    });
    if (!profile || profile.partner.status !== 'ACTIVE') {
      return null;
    }
    return profile;
  }

  async summary(doctorPersonId: string) {
    const profile = await this.requireDoctorProfile(doctorPersonId);
    if (!profile) {
      return {
        sandbox: true as const,
        live_payout: false,
        settlement_enabled: false,
        payout_authority: 'platform_finance',
        message:
          'Active doctor profile required. When consults complete, payable accrues for platform settlement (not an in-app wallet withdraw).',
        country_code: 'XX',
        currency: 'XXX',
        completed_consult_count: 0,
        unit_fee_minor: '0',
        platform_fee_bps: 0,
        gross_minor: '0',
        platform_fee_minor: '0',
        doctor_payable_minor: '0',
        pending_settlement_minor: '0',
        settled_minor: '0',
        settlement_status: 'SANDBOX_NOT_SETTLED',
      };
    }
    const resolved = await this.policy.resolvePublished(profile.country.isoAlpha2);
    const commerce = (resolved?.document.commerce ?? {}) as PartnerFeeCommerce;
    const defaultBps = resolvePartnerPlatformFeeBps('doctor', commerce);
    const fee = this.parseFeeConfig(profile.consultationConfig, profile.country.defaultCurrency, defaultBps);
    const completed = await this.prisma.appointment.findMany({
      where: {
        doctorProfileId: profile.id,
        status: AppointmentStatus.COMPLETED,
      },
      orderBy: { startsAt: 'desc' },
      take: 200,
      include: { country: true },
    });

    const count = completed.length;
    const grossMinor = fee.feeMinor * BigInt(count);
    const platformFeeMinor = fee.platformFeeMinor * BigInt(count);
    const doctorPayableMinor = fee.doctorPayableMinor * BigInt(count);

    return {
      sandbox: true as const,
      live_payout: false,
      settlement_enabled: false,
      payout_authority: 'platform_finance',
      message:
        'Sandbox consult earnings from completed appointments. Doctor payout is platform settlement (finance) — not an in-app wallet withdraw. Live bank/PSP payout remains EXTERNAL_GATED.',
      country_code: profile.country.isoAlpha2,
      currency: fee.currency,
      completed_consult_count: count,
      unit_fee_minor: minorJson(fee.feeMinor),
      platform_fee_bps: fee.platformFeeBps,
      gross_minor: minorJson(grossMinor),
      platform_fee_minor: minorJson(platformFeeMinor),
      doctor_payable_minor: minorJson(doctorPayableMinor),
      pending_settlement_minor: minorJson(doctorPayableMinor),
      settled_minor: '0',
      settlement_status: 'SANDBOX_NOT_SETTLED',
    };
  }

  async consultations(doctorPersonId: string) {
    const profile = await this.requireDoctorProfile(doctorPersonId);
    if (!profile) {
      return {
        sandbox: true as const,
        live_payout: false,
        data: [] as Array<{
          appointment_id: string;
          completed_at: string;
          starts_at: string;
          country_code: string;
          currency: string;
          gross_minor: string;
          platform_fee_minor: string;
          doctor_payable_minor: string;
          settlement_status: 'SANDBOX_NOT_SETTLED';
          settlement_batch_id: null;
        }>,
      };
    }
    const resolved = await this.policy.resolvePublished(profile.country.isoAlpha2);
    const commerce = (resolved?.document.commerce ?? {}) as PartnerFeeCommerce;
    const defaultBps = resolvePartnerPlatformFeeBps('doctor', commerce);
    const fee = this.parseFeeConfig(profile.consultationConfig, profile.country.defaultCurrency, defaultBps);
    const rows = await this.prisma.appointment.findMany({
      where: {
        doctorProfileId: profile.id,
        status: AppointmentStatus.COMPLETED,
      },
      orderBy: { startsAt: 'desc' },
      take: 50,
      include: { country: true },
    });

    return {
      sandbox: true as const,
      live_payout: false,
      data: rows.map((row) => ({
        appointment_id: row.id,
        completed_at: row.updatedAt.toISOString(),
        starts_at: row.startsAt.toISOString(),
        country_code: row.country.isoAlpha2,
        currency: fee.currency,
        gross_minor: minorJson(fee.feeMinor),
        platform_fee_minor: minorJson(fee.platformFeeMinor),
        doctor_payable_minor: minorJson(fee.doctorPayableMinor),
        settlement_status: 'SANDBOX_NOT_SETTLED' as const,
        settlement_batch_id: null,
      })),
    };
  }
}
