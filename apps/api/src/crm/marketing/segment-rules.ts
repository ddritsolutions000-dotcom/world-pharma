import { Errors } from '../../common/problem';
import type { PrismaService } from '../../app/prisma.service';

const FORBIDDEN_RULE_TOKENS = [
  'health_timeline',
  'lab_result',
  'analyte',
  'imaging_finding',
  'prescription',
  'diagnosis',
  'consent_scope',
  'break_glass',
  'artifact',
  'consult_note',
  'care_nav',
];

export type SegmentRuleV1 =
  | { type: 'all'; rules: SegmentRuleV1[] }
  | { type: 'has_order_in_country' }
  | { type: 'person_ids'; person_ids: string[] };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateSegmentRules(rules: unknown): SegmentRuleV1 {
  const raw = JSON.stringify(rules ?? {}).toLowerCase();
  for (const token of FORBIDDEN_RULE_TOKENS) {
    if (raw.includes(token)) {
      throw Errors.validation(`Segment rules must not reference clinical field: ${token}`);
    }
  }
  return parseRuleNode(rules);
}

function parseRuleNode(input: unknown): SegmentRuleV1 {
  if (!input || typeof input !== 'object') {
    throw Errors.validation('Segment rules must be a JSON object');
  }
  const node = input as Record<string, unknown>;
  const type = node.type;
  if (type === 'all') {
    if (!Array.isArray(node.rules) || node.rules.length === 0) {
      throw Errors.validation('all rules must contain a non-empty rules array');
    }
    return { type: 'all', rules: node.rules.map((r) => parseRuleNode(r)) };
  }
  if (type === 'has_order_in_country') {
    return { type: 'has_order_in_country' };
  }
  if (type === 'person_ids') {
    if (!Array.isArray(node.person_ids) || node.person_ids.length === 0) {
      throw Errors.validation('person_ids rule requires a non-empty person_ids array');
    }
    for (const id of node.person_ids) {
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        throw Errors.validation('person_ids must contain valid UUIDs');
      }
    }
    return { type: 'person_ids', person_ids: node.person_ids as string[] };
  }
  throw Errors.validation(`Unsupported segment rule type: ${String(type)}`);
}

export async function evaluateSegmentRules(
  prisma: PrismaService,
  countryId: string,
  rules: SegmentRuleV1,
): Promise<string[]> {
  if (rules.type === 'all') {
    const sets = await Promise.all(rules.rules.map((r) => evaluateSegmentRules(prisma, countryId, r)));
    if (sets.length === 0) {
      return [];
    }
    return sets.reduce((acc, ids) => acc.filter((id) => ids.includes(id)), sets[0] ?? []);
  }
  if (rules.type === 'person_ids') {
    return [...new Set(rules.person_ids)];
  }
  const orders = await prisma.order.findMany({
    where: { countryId },
    select: { customerPersonId: true },
    distinct: ['customerPersonId'],
  });
  return orders.map((o) => o.customerPersonId);
}

export function assertSafeCampaignContent(title: string, body: string) {
  const raw = `${title} ${body}`.toLowerCase();
  for (const token of FORBIDDEN_RULE_TOKENS) {
    if (raw.includes(token)) {
      throw Errors.validation(`Campaign content must not reference clinical field: ${token}`);
    }
  }
}
