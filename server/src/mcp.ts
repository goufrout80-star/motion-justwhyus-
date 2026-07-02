import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { generateFromPrompt } from './gemini.js';

/**
 * Builds a fresh MCP server exposing our video-generation capability as a
 * tool. Any MCP client (ChatGPT connectors, Claude Desktop, custom agents)
 * that connects to this endpoint can call `generate_video`.
 */
function buildServer(): McpServer {
  const server = new McpServer({
    name: 'omni-studio',
    version: '1.0.0',
  });

  server.registerTool(
    'generate_video',
    {
      title: 'Generate a video',
      description:
        'Generate a video from a text prompt using Google Gemini Omni on Vertex AI. ' +
        'Returns the generated video as a data URL (or a Cloud Storage URI when available).',
      inputSchema: {
        prompt: z.string().describe('A description of the video to create.'),
      },
    },
    async ({ prompt }) => {
      const assets = await generateFromPrompt({ prompt });

      const content: Array<{ type: 'text'; text: string }> = [];
      for (const asset of assets) {
        if (asset.type === 'text' && asset.text) {
          content.push({ type: 'text', text: asset.text });
        } else if (asset.type === 'video') {
          if (asset.uri) {
            content.push({ type: 'text', text: `Video available at: ${asset.uri}` });
          } else if (asset.base64Data) {
            content.push({
              type: 'text',
              text: `data:${asset.mimeType || 'video/mp4'};base64,${asset.base64Data}`,
            });
          }
        } else if (asset.type === 'image' && asset.base64Data) {
          content.push({
            type: 'text',
            text: `data:${asset.mimeType || 'image/png'};base64,${asset.base64Data}`,
          });
        }
      }

      if (content.length === 0) {
        content.push({ type: 'text', text: 'No output was returned by the model.' });
      }

      return { content };
    }
  );

  return server;
}

/**
 * Express handler for the MCP endpoint. Runs in stateless mode: a new server
 * + transport is created per request, which is required for serverless
 * platforms like Vercel where there is no shared in-memory session store.
 *
 * This server does NOT implement OAuth (no discovery/authorization/token
 * endpoints). Clients must connect with "No authentication". GET and POST
 * are both handled here per the MCP Streamable HTTP spec — GET opens an SSE
 * stream, POST carries JSON-RPC requests. Any other method gets a clear JSON
 * 405, never an HTML error page.
 */
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use GET or POST for MCP.' },
      id: null,
    });
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] request failed', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}
