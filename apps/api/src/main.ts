import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { parseEnv } from '@world-pharma/config';
import { AppModule } from './app/app.module';
import { configureApi } from './common/http-setup';

function loadLocalEnv(): void {
  try {
    const src = readFileSync('.env', 'utf8');
    for (const line of src.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq < 1) {
        continue;
      }
      process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    // Optional when CI or the shell already provides variables.
  }
}

async function bootstrap(): Promise<void> {
  loadLocalEnv();
  const env = parseEnv();
  const started = Date.now();
  const app = await NestFactory.create(AppModule);
  configureApi(app, env);
  app.enableShutdownHooks();
  const server = app.getHttpServer() as { setTimeout?: (ms: number) => void };
  server.setTimeout?.(30_000);
  await app.listen(env.PORT);
  Logger.log(
    JSON.stringify({
      event: 'api_started',
      port: env.PORT,
      git_sha: env.GIT_SHA ?? 'unknown',
      version: env.APP_VERSION ?? '0.0.0',
      startup_ms: Date.now() - started,
    }),
  );
}

void bootstrap();
