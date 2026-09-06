import { INestApplication } from '@nestjs/common';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AppEnv } from '@world-pharma/config';
import { ProblemFilter } from './problem.filter';
import { requestIdMiddleware } from './request-id.middleware';
import { isAllowedApiHost, parseTrustedProxySetting, type TrustedProxySetting } from './client-ip';

export function allowedOrigins(env: AppEnv): string[] {
  if (env.CORS_ALLOWED_ORIGINS.trim()) {
    return env.CORS_ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
    return [];
  }
  const origins: string[] = [];
  for (let port = 3000; port <= 3011; port += 1) {
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  for (let port = 3000; port <= 3011; port += 1) {
    origins.push(`http://vendor.demo.com:${port}`);
  }
  origins.push('http://vendor.demo.com');
  for (const port of [8081, 8082, 8091, 8092]) {
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  for (let port = 19000; port <= 19020; port += 1) {
    origins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  }
  return origins;
}

const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), display-capture=()';
const MAX_URL_LENGTH = 8192;

export function configureApi(app: INestApplication, env: AppEnv): void {
  const trust = parseTrustedProxySetting(env.TRUSTED_PROXIES);
  if (trust !== false) {
    const expressApp = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: TrustedProxySetting) => void;
    };
    expressApp.set('trust proxy', trust);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // JSON API is consumed cross-origin by future web apps; Helmet's
      // default same-origin CORP would block allowed CORS origins.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'no-referrer' },
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.originalUrl?.length ?? 0) > MAX_URL_LENGTH) {
      res.status(414).type('application/problem+json').json({
        type: 'https://worldpharma.example/problems/uri-too-long',
        title: 'URI too long',
        status: 414,
        detail: 'Request URI exceeds the allowed length.',
        code: 'URI_TOO_LONG',
      });
      return;
    }
    next();
  });
  // Optional Host allowlist — only when PUBLIC_API_HOSTS is explicitly configured.
  if (env.PUBLIC_API_HOSTS.trim()) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (!isAllowedApiHost(req.headers.host, env.PUBLIC_API_HOSTS)) {
        res.status(400).type('application/problem+json').json({
          type: 'https://worldpharma.example/problems/invalid-host',
          title: 'Invalid Host',
          status: 400,
          detail: 'Host header is not allowed for this API.',
          code: 'INVALID_HOST',
        });
        return;
      }
      next();
    });
  }
  app.enableCors({
    origin: allowedOrigins(env),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'x-request-id',
      'x-correlation-id',
      'Idempotency-Key',
      'x-sandbox-signature',
    ],
  });
  app.use(
    json({
      limit: env.HTTP_JSON_LIMIT,
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: env.HTTP_JSON_LIMIT }));
  app.use(requestIdMiddleware);
  app.useGlobalFilters(new ProblemFilter());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready', 'health/version', 'metrics'] });
}
