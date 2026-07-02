import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { generateFromPrompt, type GeneratedAsset } from './gemini.js';

const VIDEO_MIME_TYPE = 'video/mp4';

/**
 * Converts our internal generation output into MCP content blocks. Exported
 * as a pure function so the exact video/image/text framing can be unit
 * tested without spending Vertex AI quota.
 */
export function assetsToContent(assets: GeneratedAsset[]): ContentBlock[] {
  const content: ContentBlock[] = [];

  for (const asset of assets) {
    if (asset.type === 'video') {
      if (asset.uri) {
        // Delivered to Cloud Storage: point at it directly instead of
        // inlining bytes.
        content.push({
          type: 'resource_link',
          uri: asset.uri,
          name: 'generated-video.mp4',
          mimeType: asset.mimeType || VIDEO_MIME_TYPE,
        });
      } else if (asset.base64Data) {
        // Inline bytes: embed as a proper binary resource (blob + mimeType)
        // so MCP clients render it as a video attachment instead of
        // dumping the base64 string as chat text.
        content.push({
          type: 'resource',
          resource: {
            uri: `generated://video/${randomUUID()}.mp4`,
            mimeType: asset.mimeType || VIDEO_MIME_TYPE,
            blob: asset.base64Data,
          },
        });
      }
    } else if (asset.type === 'image' && asset.base64Data) {
      // Images have a first-class MCP content type — use it rather than a
      // text data URL.
      content.push({
        type: 'image',
        data: asset.base64Data,
        mimeType: asset.mimeType || 'image/png',
      });
    } else if (asset.type === 'text' && asset.text) {
      content.push({ type: 'text', text: asset.text });
    }
  }

  if (content.length === 0) {
    content.push({ type: 'text', text: 'No output was returned by the model.' });
  }

  return content;
}

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
        'Generate an MP4 video from a text prompt using Google Gemini Omni on Vertex AI. ' +
        'Returns the video as a proper MCP media attachment (an embedded video/mp4 resource, ' +
        'or a resource_link if it was delivered to Cloud Storage) — never as raw text.',
      inputSchema: {
        prompt: z.string().describe('A description of the video to create.'),
      },
    },
    async ({ prompt }) => {
      const assets = await generateFromPrompt({ prompt });
      return { content: assetsToContent(assets) };
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
