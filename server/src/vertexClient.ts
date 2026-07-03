import { GoogleGenAI } from '@google/genai';
import { resolveCredentials } from './credentials.js';
import { getGoogleAuthClient } from './google-auth.js';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';

/**
 * Shared Vertex AI client used by both video generation (Omni) and chat
 * (Gemini 3.5 Flash) — one project, one auth mechanism: gcloud ADC locally,
 * Vercel OIDC + Workload Identity Federation in production. No separate API
 * key is needed for chat.
 *
 * Built lazily so a missing/broken config surfaces as a JSON error inside a
 * request handler instead of crashing the whole serverless function at
 * import time.
 */
let client: GoogleGenAI | null = null;

export function getVertexClient(): GoogleGenAI {
  if (client) return client;

  if (!project) {
    throw new Error(
      'GOOGLE_CLOUD_PROJECT is not set. Configure it in the environment (server/.env locally, or Vercel project settings).'
    );
  }

  // Local dev may resolve a key file or ADC; on Vercel this is a no-op.
  resolveCredentials();

  const authClient = getGoogleAuthClient();

  client = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    ...(authClient ? { googleAuthOptions: { authClient } } : {}),
    httpOptions: { headers: { 'Api-Revision': '2026-05-20' } },
  });

  return client;
}
