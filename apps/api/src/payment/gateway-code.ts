import { Prisma } from '@prisma/client';

export function gatewayCodeFromRouting(routingJson: Prisma.JsonValue): string | null {
  if (!routingJson || typeof routingJson !== 'object' || Array.isArray(routingJson)) {
    return null;
  }
  const row = routingJson as Record<string, unknown>;
  const code = row.gateway_code;
  return typeof code === 'string' ? code : null;
}

export function gatewayEnvironmentFromRouting(routingJson: Prisma.JsonValue): string | null {
  if (!routingJson || typeof routingJson !== 'object' || Array.isArray(routingJson)) {
    return null;
  }
  const env = (routingJson as Record<string, unknown>).gateway_environment;
  return typeof env === 'string' ? env : null;
}
