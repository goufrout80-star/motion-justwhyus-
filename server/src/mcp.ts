import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { generateFromPrompt, type GeneratedAsset } from './gemini.js';
import { isVideoHostingConfigured, storeVideo } from './videoStore.js';

const VIDEO_MIME_TYPE = 'video/mp4';

type HostVideo = (base64Data: string, mimeType: string) => Promise<{ id: string; url: string }>;

/**
 * Converts our internal generation output into MCP content blocks.
 *
 * This tool's whole contract with clients (ChatGPT, Claude, etc.) is
 * "you call this, you get a video back" — nothing else. So this
 * intentionally only ever emits video content blocks and drops any stray
 * image/text the model may have also produced, instead of returning a
 * mixed bag that would make the client unsure what it's getting. If no
 * video came back at all, that's an explicit failure, not a silent
 * fallback to text/image.
 *
 * Inline video bytes are uploaded to Vercel Blob and returned as a
 * resource_link under our own domain (https://motion.nanoni.studio/videos/<id>)
 * instead of embedding megabytes of base64 in the response — real MCP
 * clients handle a plain URL far more reliably than a large inline blob. If
 * no Blob store is configured yet (e.g. local dev), it falls back to
 * embedding the bytes directly so the tool still works end to end.
 *
 * `hostVideo` is injectable so the exact framing can be unit tested without
 * hitting Vercel Blob or spending Vertex AI quota.
 */
export async function assetsToContent(
  assets: GeneratedAsset[],
  hostVideo: HostVideo = storeVideo
): Promise<ContentBlock[]> {
  const content: ContentBlock[] = [];

  for (const asset of assets) {
    if (asset.type !== 'video') continue;

    if (asset.uri) {
      // Delivered to Cloud Storage by Vertex directly: point at it as-is.
      content.push({
        type: 'resource_link',
        uri: asset.uri,
        name: 'generated-video.mp4',
        mimeType: asset.mimeType || VIDEO_MIME_TYPE,
      });
      continue;
    }

    if (!asset.base64Data) continue;

    if (isVideoHostingConfigured()) {
      const { url } = await hostVideo(asset.base64Data, asset.mimeType || VIDEO_MIME_TYPE);
      content.push({
        type: 'resource_link',
        uri: url,
        name: 'generated-video.mp4',
        mimeType: asset.mimeType || VIDEO_MIME_TYPE,
      });
    } else {
      // No Blob store attached yet — embed the bytes directly as a proper
      // binary resource instead of failing the call.
      content.push({
        type: 'resource',
        resource: {
          uri: `generated://video/${randomUUID()}.mp4`,
          mimeType: asset.mimeType || VIDEO_MIME_TYPE,
          blob: asset.base64Data,
        },
      });
    }
  }

  if (content.length === 0) {
    content.push({
      type: 'text',
      text: 'Video generation failed: the model did not return a video for this prompt. Try rephrasing the prompt and calling generate_video again.',
    });
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
    name: 'nanoni',
    version: '1.0.0',
  });

  server.registerTool(
    'generate_video',
    {
      title: 'Generate Video (MP4 only)',
      description:
        'Generates and returns ONE MP4 video from a text prompt, using Google Gemini Omni on ' +
        'Vertex AI. This tool ONLY produces video — it never returns an image and never returns ' +
        'plain text as the result. Every successful call returns exactly one video, delivered as ' +
        'a resource_link (a real https://motion.nanoni.studio/videos/<id> URL you can open or ' +
        'share directly) — never as a raw text/base64 blob. Use this tool whenever the user asks ' +
        'to create, generate, animate, or render a video; do not use it to generate still images.',
      inputSchema: {
        prompt: z.string().describe('A description of the video to create.'),
      },
      annotations: {
        title: 'Generate Video (MP4 only)',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ prompt }) => {
      const assets = await generateFromPrompt({ prompt });
      return { content: await assetsToContent(assets) };
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
