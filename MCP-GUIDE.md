# Connecting Omni Studio via MCP

Omni Studio doubles as a **remote MCP (Model Context Protocol) server**. Once
connected, an AI assistant like **ChatGPT** or **Claude** can call your site's
`generate_video` tool and create videos on demand — the same way you'd connect a
Gmail or Google Drive connector.

## Your MCP endpoint

```
https://motion.justwhyus.com/api/mcp
```

(For local testing: `http://localhost:8787/api/mcp`)

The transport is **Streamable HTTP** (the current MCP standard), stateless, so it
works both on the local Express server and on Vercel.

## What the server exposes

| Tool             | Input             | What it does                                          |
| ---------------- | ----------------- | ----------------------------------------------------- |
| `generate_video` | `prompt` (string) | Generates a video with Gemini Omni on Vertex AI and returns it as a data URL (or a Cloud Storage URI when available). |

---

## Connect from ChatGPT

ChatGPT supports custom remote MCP connectors through **Developer mode**.

1. In ChatGPT, go to **Settings → Connectors**.
2. Enable **Developer mode** (Settings → Connectors → Advanced → Developer mode).
3. Click **Create / Add custom connector**.
4. Fill in:
   - **Name:** `Omni Studio`
   - **MCP Server URL:** `https://motion.justwhyus.com/api/mcp`
   - **Authentication:** None (unless you add auth — see below)
5. Save. ChatGPT will connect and discover the `generate_video` tool.
6. In a chat, enable the connector, then ask:
   > "Use Omni Studio to generate a video of a neon city at night."

ChatGPT calls `generate_video`, and the returned video data URL / link comes
back in the conversation.

> Note: custom MCP connectors in ChatGPT require a plan that includes Developer
> mode (Plus / Pro / Business). Availability changes over time — if you don't see
> Developer mode, check OpenAI's current connector documentation.

---

## Connect from Claude (Desktop or claude.ai)

1. Go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. **Name:** `Omni Studio` — **URL:** `https://motion.justwhyus.com/api/mcp`
4. Save, then enable it in a conversation and ask Claude to generate a video.

---

## Connect from a local MCP client (config file)

For clients that use a JSON config (e.g. some IDE agents), point them at the
remote server over HTTP:

```json
{
  "mcpServers": {
    "omni-studio": {
      "type": "http",
      "url": "https://motion.justwhyus.com/api/mcp"
    }
  }
}
```

---

## Testing the endpoint yourself

List the available tools with a raw JSON-RPC call:

```bash
curl -s -X POST https://motion.justwhyus.com/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

You should see `generate_video` in the response.

---

## Adding authentication (recommended before going public)

The endpoint is currently **open** — anyone with the URL can trigger generation
(which costs Vertex AI credits). Before sharing it widely, protect it. The
simplest option is a shared secret header checked in
[`server/src/mcp.ts`](server/src/mcp.ts): read a `MCP_API_KEY` env var and reject
requests whose `Authorization` header doesn't match. For production, a full
OAuth flow is the MCP-recommended approach.
