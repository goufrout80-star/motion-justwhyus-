import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { generateRouter } from './routes/generate.js';
import { chatRouter } from './routes/chat.js';
import { videosRouter } from './routes/videos.js';
import { handleMcpRequest } from './mcp.js';

export const app = express();

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',');

app.use(cors({ origin: allowedOrigins }));
// Base64-encoded reference images can be large, so raise the JSON limit.
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, project: process.env.GOOGLE_CLOUD_PROJECT || null });
});

app.use('/api/generate', generateRouter);

// Conversational Gemini chat — same Vertex AI project/auth as Omni.
app.use('/api/chat', chatRouter);

// Hosted video links returned by the MCP tool and the web app, e.g.
// https://motion.nanoni.studio/videos/<id> — redirects to the underlying
// Vercel Blob storage URL.
app.use('/videos', videosRouter);

// Remote MCP endpoint — connect from ChatGPT, Claude Desktop, or any MCP client.
app.all('/api/mcp', handleMcpRequest);

// This server does not implement OAuth. If a client is misconfigured to use
// OAuth (instead of "No authentication"), it will typically probe these
// well-known discovery URLs first. Respond with a clear, explicit JSON error
// instead of Express's default HTML 404 page, so the failure is obvious.
const OAUTH_NOT_IMPLEMENTED = {
  error: 'oauth_not_supported',
  message:
    'This MCP server does not implement OAuth yet. In your MCP client, set Authentication to "No authentication" and use the server URL directly (https://motion.nanoni.studio/api/mcp).',
};
app.all(
  ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/.well-known/openid-configuration'],
  (_req: Request, res: Response) => {
    res.status(404).json(OAUTH_NOT_IMPLEMENTED);
  }
);
app.all(
  ['/api/mcp/.well-known/oauth-authorization-server', '/api/mcp/.well-known/oauth-protected-resource'],
  (_req: Request, res: Response) => {
    res.status(404).json(OAUTH_NOT_IMPLEMENTED);
  }
);

// Any unknown /api/* route returns JSON, never HTML.
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: true, message: 'Not found' });
});

// Catch-all JSON error handler so the frontend always gets parseable JSON.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[app] unhandled error', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (!res.headersSent) {
    res.status(500).json({ error: true, message });
  }
});
