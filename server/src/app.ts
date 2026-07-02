import express from 'express';
import cors from 'cors';
import { generateRouter } from './routes/generate.js';
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

// Remote MCP endpoint — connect from ChatGPT, Claude Desktop, or any MCP client.
app.all('/api/mcp', handleMcpRequest);
