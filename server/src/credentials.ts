import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Resolves Google Cloud credentials across environments.
 *
 * - Local dev: uses gcloud Application Default Credentials
 *   (`gcloud auth application-default login`). Nothing to do here.
 * - Vercel / serverless: there is no gcloud and no persistent filesystem,
 *   so paste the full service-account JSON into the GOOGLE_CREDENTIALS_JSON
 *   env var. We write it to a temp file and point ADC at it.
 */
export function resolveCredentials(): void {
  const inlineJson = process.env.GOOGLE_CREDENTIALS_JSON;

  if (inlineJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const keyPath = path.join(os.tmpdir(), 'gcp-service-account.json');
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, inlineJson, 'utf8');
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    console.log('[credentials] loaded service account from GOOGLE_CREDENTIALS_JSON');
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(
      `[credentials] using key file at ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`
    );
    return;
  }

  console.log('[credentials] using Application Default Credentials (gcloud login)');
}
