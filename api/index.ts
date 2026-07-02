// Vercel serverless entrypoint. It reuses the exact same Express app the
// local dev server runs, so there is one backend for both environments.
// Vercel builds the server first (see vercel.json), then this imports the
// compiled output.
import { app } from '../server/dist/app.js';

export default app;
