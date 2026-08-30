import { createRequire } from 'node:module';

const cjs = createRequire(__filename)('./isolate-runtime.cjs') as {
  applyTestIsolation: () => void;
  rewritePostgres: (url: string) => string;
  rewriteRedis: (url: string) => string;
  toAdminUrl: (testUrl: string) => string;
};

export const applyTestIsolation = cjs.applyTestIsolation;
export const rewritePostgres = cjs.rewritePostgres;
export const rewriteRedis = cjs.rewriteRedis;
export const toAdminUrl = cjs.toAdminUrl;
