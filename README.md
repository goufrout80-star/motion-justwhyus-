# Nanoni

A ChatGPT/Claude-style chat app with a built-in AI video generator. Chat with
Gemini (with Google Search & Maps tools); ask it to make a video and it will
always confirm with you first, then call **Omni** (Gemini Omni on Vertex AI)
to generate it. There's also a manual "Create Video" panel with mode and
duration controls, and a built-in **MCP server** so ChatGPT/Claude can call
Omni directly too. Chat history is stored locally in your browser.

- `client/` — Vite + React + TypeScript frontend
- `server/` — Express + TypeScript backend (`@google/genai` → Vertex AI) + MCP endpoint
- `api/` — Vercel serverless entrypoint (reuses the same Express app)

---

## 1. Run it locally

### One-time Google Cloud setup

1. In the [Google Cloud Console](https://console.cloud.google.com/), select your project.
2. **Enable the Vertex AI API** and make sure **billing** is on.
3. Sign in locally with Application Default Credentials:
   ```bash
   gcloud auth application-default login
   gcloud config set project YOUR_PROJECT_ID
   ```

### Configure & start

```bash
# from the repo root
npm install                 # installs concurrently + Vercel tooling
npm run install:all         # installs client and server deps
```

Set your project id in `server/.env` (`GOOGLE_CLOUD_PROJECT=...`). The key-file
line stays commented out — locally you're using gcloud ADC.

### Chat

Chat (Gemini 3.5 Flash) runs through the same Vertex AI project and
credentials as Omni video generation above — no separate API key. Once
`GOOGLE_CLOUD_PROJECT` is set and you're logged in via gcloud ADC, chat works
automatically. The model is configurable via `server/.env`:

```
GEMINI_CHAT_MODEL=gemini-3.5-flash   # optional, this is the default
```

```bash
npm run dev                 # runs server (:8787) and client (:5173) together
```

Open **http://localhost:5173** — start a new chat, or switch to "Create Video
(Manual)" in the sidebar for the mode/duration-driven generator.

---

## 2. Connect an AI assistant (MCP)

The app exposes a remote MCP server at:

```
https://motion.nanoni.studio/api/mcp     # production
http://localhost:8787/api/mcp            # local
```

It offers a `generate_video` tool. Full step-by-step for ChatGPT / Claude is in
[MCP-GUIDE.md](MCP-GUIDE.md).

---

## 3. Deploy to Vercel

### a. Push to GitHub

```bash
git init
git add .
git commit -m "Nanoni: video generation + MCP server"
git branch -M main
git remote add origin https://github.com/<you>/motion.nanoni.studio.git
git push -u origin main
```

### b. Import into Vercel

1. On [vercel.com](https://vercel.com), **Add New → Project** and import the repo.
2. Vercel reads [`vercel.json`](vercel.json) automatically (build command, output
   directory, and the `api/` function are all configured).
3. Add **Environment Variables** (Settings → Environment Variables). This app
   authenticates to Vertex AI **keylessly** using Vercel OIDC + Google Workload
   Identity Federation — **no service-account JSON key** is used (many orgs block
   key creation via `iam.disableServiceAccountKeyCreation`).

   | Variable                                | Value                                                        |
   | --------------------------------------- | ----------------------------------------------------------- |
   | `GOOGLE_CLOUD_PROJECT`                  | `project-b9b29161-6ab2-4096-b54`                            |
   | `GOOGLE_CLOUD_LOCATION`                 | `global`                                                    |
   | `GEMINI_MODEL`                          | `gemini-omni-flash-preview`                                 |
   | `GCP_PROJECT_NUMBER`                    | `921358658147`                                             |
   | `GCP_SERVICE_ACCOUNT_EMAIL`             | `vercel-vertex@project-b9b29161-6ab2-4096-b54.iam.gserviceaccount.com` |
   | `GCP_WORKLOAD_IDENTITY_POOL_ID`         | `vercel`                                                   |
   | `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`| `vercel`                                                   |
   | `CLIENT_ORIGIN`                         | `https://motion.nanoni.studio`                             |
   | `PUBLIC_BASE_URL`                       | `https://motion.nanoni.studio`                             |
   | `GEMINI_CHAT_MODEL`                     | `gemini-3.5-flash` (optional, chat uses the same Vertex auth as Omni above) |

   > **Enable Vercel OIDC** for the project: Settings → Security → OIDC → turn it
   > on (team-scoped issuer). The auth helper
   > [`server/src/google-auth.ts`](server/src/google-auth.ts) exchanges the
   > per-request Vercel OIDC token for short-lived Google credentials via WIF and
   > impersonates the `GCP_SERVICE_ACCOUNT_EMAIL` service account (which holds
   > `roles/aiplatform.user`).

3b. **Attach a Blob store** so generated videos get a real hosted link
   (`https://motion.nanoni.studio/videos/<id>`) instead of being inlined as
   base64: Project → **Storage → Create Database → Blob** → connect it to this
   project. This auto-injects a `BLOB_READ_WRITE_TOKEN` env var — no manual
   setup needed. Without it, the MCP tool still works but falls back to
   embedding the video bytes directly in the response.

4. **Deploy.** Then add your domain `motion.nanoni.studio` under Settings → Domains.

### Note on generation time

Video generation can take a while. `vercel.json` sets `maxDuration: 300` for the
API function — that requires a Vercel plan that allows long function durations
(Pro or above). On the Hobby plan, long generations may time out.

---

## Scripts (root)

| Command              | Does                                             |
| -------------------- | ------------------------------------------------ |
| `npm run install:all`| install client + server deps                     |
| `npm run dev`        | run both dev servers                             |
| `npm run build`      | build client + server                            |
| `npm run vercel-build` | build used by Vercel                           |
