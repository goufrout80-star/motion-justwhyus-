import { ExternalAccountClient, type AuthClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

/**
 * Returns a Google auth client for Vertex AI, or `undefined` to let the SDK
 * use Application Default Credentials.
 *
 * Priority:
 *   1. Local dev / backward compat — if a JSON key or ADC is present
 *      (GOOGLE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS), return
 *      undefined so @google/genai uses the default ADC flow (gcloud login).
 *   2. Vercel (keyless) — Workload Identity Federation via Vercel OIDC.
 *      No service-account JSON key is used (org policy forbids key creation).
 *
 * If neither is configured we return undefined and let the SDK try ADC, so a
 * misconfiguration surfaces as a normal auth error inside the request handler
 * (returned as JSON) rather than crashing module load.
 */
export function getGoogleAuthClient(): AuthClient | undefined {
  // 1. Local dev / explicit key file → default ADC handling.
  if (process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return undefined;
  }

  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;

  // 2. Workload Identity Federation (keyless) — requires the full WIF config.
  if (!projectNumber || !poolId || !providerId || !serviceAccountEmail) {
    return undefined;
  }

  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      // Vercel injects a fresh OIDC token per invocation.
      getSubjectToken: () => getVercelOidcToken(),
    },
  });

  return client ?? undefined;
}
