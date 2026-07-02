import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Resolves Google Cloud credentials for the classic key-file / ADC paths.
 *
 * - Local dev: uses gcloud Application Default Credentials
 *   (`gcloud auth application-default login`). Nothing to do here.
 * - Optional backward-compat: if GOOGLE_CREDENTIALS_JSON is provided (a full
 *   service-account JSON), it is written to a temp file and used as ADC.
 *
 * NOTE: On Vercel we do NOT use a JSON key (org policy blocks key creation).
 * Keyless auth via Vercel OIDC + Workload Identity Federation is handled in
 * google-auth.ts instead. This function is a no-op when only WIF env vars are
 * set.
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
