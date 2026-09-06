import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Errors } from '../common/problem';
import { resolvePayoutSecret, readPartnerPayoutRuntimeConfig } from './payout.config';
import { PayoutPort, type PayoutSubmitInput, type PayoutSubmitResult } from './payout.port';

type RazorpayXPayoutResponse = {
  id?: string;
  status?: string;
  failure_reason?: string;
  error?: { code?: string; description?: string };
};

/**
 * RazorpayX production payout adapter.
 * Submits disbursements; never invents PAID — webhook / status poll confirms.
 */
@Injectable()
export class RazorpayXPayoutAdapter extends PayoutPort {
  readonly code = 'RAZORPAYX';
  private readonly logger = new Logger(RazorpayXPayoutAdapter.name);

  private authHeader(): string {
    const keyId = resolvePayoutSecret(
      process.env['RAZORPAYX_KEY_ID'] ?? process.env['AFFILIATE_PAYOUT_KEY_ID'],
    );
    const keySecret = resolvePayoutSecret(
      process.env['RAZORPAYX_KEY_SECRET'] ?? process.env['AFFILIATE_PAYOUT_SECRET'],
    );
    if (!keyId || !keySecret) {
      throw Errors.problem(
        503,
        'PAYOUT_CREDENTIALS_MISSING',
        'Payout credentials missing',
        'RAZORPAYX_KEY_ID and RAZORPAYX_KEY_SECRET (or secret refs) are required for live payout.',
      );
    }
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
  }

  private baseUrl(): string {
    return (process.env['RAZORPAYX_API_BASE'] ?? 'https://api.razorpay.com/v1').replace(/\/$/, '');
  }

  async submit(input: PayoutSubmitInput): Promise<PayoutSubmitResult> {
    const cfg = readPartnerPayoutRuntimeConfig();
    if (!cfg.live_ready) {
      throw Errors.problem(
        503,
        'LIVE_PAYOUT_NOT_READY',
        'Live payout not ready',
        cfg.remaining_blocker ?? 'Live partner payout gates are not satisfied.',
      );
    }
    if (!input.beneficiary) {
      throw Errors.validation('beneficiary is required for RazorpayX payout');
    }
    if (input.currency.toUpperCase() !== 'INR') {
      throw Errors.problem(
        409,
        'PAYOUT_CURRENCY_UNSUPPORTED',
        'Currency unsupported',
        'RazorpayX partner payouts currently support INR only. Other markets remain policy-gated.',
      );
    }

    const contact = await this.createContact(input.beneficiary.account_holder_name, input.payoutId);
    const fundAccountId = await this.createFundAccount(contact, input.beneficiary);
    const body = {
      account_number: resolvePayoutSecret(process.env['RAZORPAYX_ACCOUNT_NUMBER']),
      fund_account_id: fundAccountId,
      amount: Number(input.amountMinor),
      currency: 'INR',
      mode: input.beneficiary.method === 'UPI' ? 'UPI' : 'IMPS',
      purpose: input.purpose ?? 'payout',
      queue_if_low_balance: true,
      reference_id: input.idempotencyKey.slice(0, 40),
      narration: (input.notes ?? 'World Pharma partner payout').slice(0, 30),
    };
    if (!body.account_number) {
      throw Errors.problem(
        503,
        'RAZORPAYX_ACCOUNT_MISSING',
        'RazorpayX account missing',
        'Set RAZORPAYX_ACCOUNT_NUMBER (source account) for live disbursements.',
      );
    }

    const res = await fetch(`${this.baseUrl()}/payouts`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        'X-Payout-Idempotency': input.idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as RazorpayXPayoutResponse;
    if (!res.ok) {
      this.logger.warn(`RazorpayX payout submit failed status=${res.status} code=${json.error?.code ?? 'n/a'}`);
      return {
        submitted: false,
        failed: true,
        errorCode: json.error?.code ?? `HTTP_${res.status}`,
        mode: 'live',
      };
    }
    const status = (json.status ?? '').toLowerCase();
    if (status === 'failed' || status === 'reversed' || status === 'cancelled') {
      return {
        submitted: true,
        failed: true,
        providerRef: json.id,
        errorCode: json.failure_reason ?? status,
        mode: 'live',
      };
    }
    // processing / pending / queued / processed — never invent PAID here
    return {
      submitted: true,
      paid: false,
      providerRef: json.id,
      mode: 'live',
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = resolvePayoutSecret(
      process.env['RAZORPAYX_WEBHOOK_SECRET'] ?? process.env['PAYOUT_WEBHOOK_SECRET'],
    );
    if (!secret || !signatureHeader) {
      return false;
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  private async createContact(name: string, referenceId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl()}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name.slice(0, 50),
        type: 'vendor',
        reference_id: referenceId.slice(0, 40),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { code?: string } };
    if (!res.ok || !json.id) {
      throw Errors.problem(
        502,
        'RAZORPAYX_CONTACT_FAILED',
        'Payout contact create failed',
        json.error?.code ?? `HTTP_${res.status}`,
      );
    }
    return json.id;
  }

  private async createFundAccount(
    contactId: string,
    beneficiary: NonNullable<PayoutSubmitInput['beneficiary']>,
  ): Promise<string> {
    const payload =
      beneficiary.method === 'UPI'
        ? {
            contact_id: contactId,
            account_type: 'vpa',
            vpa: { address: beneficiary.upi_id },
          }
        : {
            contact_id: contactId,
            account_type: 'bank_account',
            bank_account: {
              name: beneficiary.account_holder_name.slice(0, 50),
              ifsc: beneficiary.ifsc_or_routing,
              account_number: beneficiary.account_number,
            },
          };
    const res = await fetch(`${this.baseUrl()}/fund_accounts`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { code?: string } };
    if (!res.ok || !json.id) {
      throw Errors.problem(
        502,
        'RAZORPAYX_FUND_ACCOUNT_FAILED',
        'Payout fund account create failed',
        json.error?.code ?? `HTTP_${res.status}`,
      );
    }
    return json.id;
  }
}
