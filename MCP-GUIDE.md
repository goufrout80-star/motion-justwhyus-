# Connecting Nanoni via MCP

Nanoni doubles as a **remote MCP (Model Context Protocol) server**. Once
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
| `generate_video` | `prompt` (string) | Generates a video with Gemini Omni on Vertex AI. Returns it as a real link — `https://motion.justwhyus.com/videos/<id>` — that opens or downloads the MP4 directly. This tool only ever returns video; it never returns an image or plain text as the result. |

The returned link is hosted under this site's own domain (backed by Vercel
Blob storage), not a raw base64 blob — so it's small, shareable, and works
the same whether you open it in a browser or hand it to another tool.

---

## Connect from ChatGPT

ChatGPT supports custom remote MCP connectors through **Developer mode**.

1. In ChatGPT, go to **Settings → Connectors**.
2. Enable **Developer mode** (Settings → Connectors → Advanced → Developer mode).
3. Click **Create / Add custom connector**.
4. Fill in:
   - **Name:** `Nanoni`
   - **MCP Server URL:** `https://motion.justwhyus.com/api/mcp`
   - **Authentication:** **No authentication** ⚠️ *(this is required right now — see below)*
5. Save. ChatGPT will connect and discover the `generate_video` tool.
6. In a chat, enable the connector, then ask:
   > "Use Nanoni to generate a video of a neon city at night."

ChatGPT calls `generate_video`, and the returned video data URL / link comes
back in the conversation.

> **Important — do not select "OAuth" in the Authentication dropdown.** This
> server does not implement OAuth (no discovery, authorization, or token
> endpoints) yet. Selecting OAuth in ChatGPT will make it probe
> `/.well-known/oauth-authorization-server` and similar endpoints, which this
> server correctly reports as unsupported — the connection will not succeed.
> Choosing **No authentication** is the correct, working setup for now. OAuth
> support is a planned future addition once the endpoint needs to be locked
> down (see the section below).

> Note: custom MCP connectors in ChatGPT require a plan that includes Developer
> mode (Plus / Pro / Business). Availability changes over time — if you don't see
> Developer mode, check OpenAI's current connector documentation.

---

## Connect from Claude (Desktop or claude.ai)

1. Go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. **Name:** `Nanoni` — **URL:** `https://motion.justwhyus.com/api/mcp`
4. Save, then enable it in a conversation and ask Claude to generate a video.

---

## Connect from a local MCP client (config file)

For clients that use a JSON config (e.g. some IDE agents), point them at the
remote server over HTTP:

```json
{
  "mcpServers": {
    "nanoni": {
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

## Current auth status: no authentication (by design, for now)

The `/api/mcp` endpoint is currently **unauthenticated** — any client that has
the URL can call `generate_video`, which spends Vertex AI credits. OAuth is
**not implemented yet**: there are no
`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`,
authorization, or token endpoints. If a client is set to use OAuth against this
server, those discovery requests will hit a clear `404 { "error":
"oauth_not_supported", ... }` JSON response instead of succeeding — this is
intentional so failures are obvious rather than silent. **Use "No
authentication" in your MCP client until OAuth support ships.**

Don't confuse this with the **Vercel OIDC + Google Workload Identity
Federation** setup described in [README.md](README.md) — that is a completely
separate, unrelated auth flow: it's how the *server* authenticates to *Google
Vertex AI* to generate videos. It has nothing to do with how *MCP clients*
(ChatGPT, Claude, etc.) authenticate to *this server*.

Before sharing the MCP URL publicly, protect it. The simplest option is a
shared secret header checked in [`server/src/mcp.ts`](server/src/mcp.ts): read
an `MCP_API_KEY` env var and reject requests whose `Authorization` header
doesn't match. A full OAuth authorization-server implementation (discovery +
authorize + token endpoints) is the MCP-recommended long-term approach and is
planned but not yet built.
