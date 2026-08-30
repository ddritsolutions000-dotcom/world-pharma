import { PaymentMethodFamily } from '@prisma/client';
import { ProblemException } from '../common/problem';
import {
  assertRoutingMatrixResponseSafe,
  filterPolicyAlignedCandidates,
  resolveEffectiveRoute,
  resolveRegistryEligibility,
} from './payment-routing-matrix';
import type { RoutingDecision } from './router';

describe('payment-routing-matrix', () => {
  const candidates: RoutingDecision[] = [
    {
      gatewayId: 'g1',
      gatewayCode: 'MOCK_PRIMARY',
      gatewayEnvironment: 'sandbox',
      accountCode: 'MOCK_PRIMARY_ACCOUNT',
      priority: 10,
      reason: 'gateway_priority:10',
    },
    {
      gatewayId: 'g2',
      gatewayCode: 'MOCK_FALLBACK',
      gatewayEnvironment: 'sandbox',
      accountCode: 'MOCK_FALLBACK_ACCOUNT',
      priority: 20,
      reason: 'gateway_priority:20',
    },
  ];

  it('filters candidates by policy gateway refs', () => {
    expect(filterPolicyAlignedCandidates(candidates, ['MOCK_PRIMARY']).map((row) => row.gatewayCode)).toEqual([
      'MOCK_PRIMARY',
    ]);
  });

  it('resolves effective route by priority among policy-aligned gateways', () => {
    const gateways = {
      isRegistered: (code: string) => code.startsWith('MOCK_'),
      resolve: (code: string, env: string) => {
        if (env !== 'sandbox') {
          throw new ProblemException(503, 'LIVE_PAYMENTS_DISABLED', 'Live payments disabled', 'sandbox only');
        }
        return { code } as never;
      },
    };
    const effective = resolveEffectiveRoute(candidates, ['MOCK_PRIMARY', 'MOCK_FALLBACK'], gateways);
    expect(effective.route?.gatewayCode).toBe('MOCK_PRIMARY');
    expect(effective.reason).toBeNull();
  });

  it('fail-closes when policy gateway refs are empty', () => {
    const gateways = { isRegistered: () => true, resolve: () => ({}) as never };
    expect(resolveEffectiveRoute(candidates, [], gateways).reason).toBe('empty_routing_policy');
  });

  it('fail-closes unknown gateway codes', () => {
    const gateways = {
      isRegistered: () => false,
      resolve: () => {
        throw new ProblemException(409, 'UNKNOWN_PAYMENT_GATEWAY', 'Unknown gateway', 'missing');
      },
    };
    expect(resolveRegistryEligibility(gateways, 'UNKNOWN_PSP', 'sandbox')).toEqual({
      eligible: false,
      reason: 'unknown_gateway',
    });
  });

  it('rejects mock gateways in production registry resolution', () => {
    const gateways = {
      isRegistered: () => true,
      resolve: (_code: string, env: string) => {
        if (env === 'production') {
          throw new ProblemException(
            409,
            'MOCK_GATEWAY_PRODUCTION_FORBIDDEN',
            'Mock gateway forbidden',
            'sandbox only',
          );
        }
        return {} as never;
      },
    };
    expect(resolveRegistryEligibility(gateways, 'MOCK_PRIMARY', 'production')).toEqual({
      eligible: false,
      reason: 'MOCK_GATEWAY_PRODUCTION_FORBIDDEN',
    });
  });

  it('keeps routing matrix responses free of secrets', () => {
    const body = {
      sandbox: true,
      rows: [
        {
          gateway_code: 'MOCK_PRIMARY',
          gateway_environment: 'sandbox',
          priority: 10,
          capabilities: ['authorize', 'capture'],
          registry_registered: true,
          policy_allowed: true,
          router_eligible: true,
          status: 'active',
          fail_closed_reason: null,
          effective_rank: 1,
          policy_source: 'published_policy_pack',
          routing_reason: 'gateway_priority:10',
        },
      ],
      effective_route: {
        gateway_code: 'MOCK_PRIMARY',
        gateway_environment: 'sandbox',
        priority: 10,
        account_code: 'MOCK_PRIMARY_ACCOUNT',
        routing_reason: 'gateway_priority:10',
      },
    };
    expect(() => assertRoutingMatrixResponseSafe(body)).not.toThrow();
    expect(() => assertRoutingMatrixResponseSafe({ secretRef: 'env:SECRET' })).toThrow(/Sensitive field exposed/);
  });

  it('uses deterministic priority ordering inputs', () => {
    const ordered = [...candidates].sort((a, b) => a.priority - b.priority);
    expect(ordered[0]?.gatewayCode).toBe('MOCK_PRIMARY');
    expect(ordered.map((row) => row.gatewayCode)).toEqual(['MOCK_PRIMARY', 'MOCK_FALLBACK']);
    expect(PaymentMethodFamily.CARD).toBe('CARD');
  });
});
