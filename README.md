# Omni Studio

AI video generation powered by **Gemini Omni** on **Vertex AI**, with a built-in
**MCP server** so assistants like ChatGPT and Claude can generate videos too.

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

```bash
npm run dev                 # runs server (:8787) and client (:5173) together
```

Open **http://localhost:5173**, type a prompt, and hit **Generate**.

---

## 2. Connect an AI assistant (MCP)

The app exposes a remote MCP server at:

```
https://motion.justwhyus.com/api/mcp     # production
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
git commit -m "Omni Studio: video generation + MCP server"
git branch -M main
git remote add origin https://github.com/<you>/motion.justwhyus.com.git
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
   | `CLIENT_ORIGIN`                         | `https://motion.justwhyus.com`                             |
   | `PUBLIC_BASE_URL`                       | `https://motion.justwhyus.com`                             |

   > **Enable Vercel OIDC** for the project: Settings → Security → OIDC → turn it
   > on (team-scoped issuer). The auth helper
   > [`server/src/google-auth.ts`](server/src/google-auth.ts) exchanges the
   > per-request Vercel OIDC token for short-lived Google credentials via WIF and
   > impersonates the `GCP_SERVICE_ACCOUNT_EMAIL` service account (which holds
   > `roles/aiplatform.user`).

3b. **Attach a Blob store** so generated videos get a real hosted link
   (`https://motion.justwhyus.com/videos/<id>`) instead of being inlined as
   base64: Project → **Storage → Create Database → Blob** → connect it to this
   project. This auto-injects a `BLOB_READ_WRITE_TOKEN` env var — no manual
   setup needed. Without it, the MCP tool still works but falls back to
   embedding the video bytes directly in the response.

4. **Deploy.** Then add your domain `motion.justwhyus.com` under Settings → Domains.

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
