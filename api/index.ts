// Vercel serverless entrypoint. It reuses the exact same Express app the
// local dev server runs, so there is one backend for both environments.
//
// server/dist/app.js is an ES module (server/package.json has
// "type": "module"), but Vercel's Node builder bundles this file as
// CommonJS. A static `import` gets transpiled to `require()`, which cannot
// load an ESM file (ERR_REQUIRE_ESM). Dynamic `import()` is the only way to
// load ESM from a CJS context, so we use that and cache the promise across
// invocations on the same warm lambda instance.
import type { IncomingMessage, ServerResponse } from 'node:http';

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let appModulePromise: Promise<{ app: ExpressApp }> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (!appModulePromise) {
      appModulePromise = import('../server/dist/app.js') as Promise<{ app: ExpressApp }>;
    }

    const mod = await appModulePromise;
    const app = mod.app;

    if (typeof app !== 'function') {
      throw new Error('server/dist/app.js does not export a valid Express app');
    }

    app(req, res);
  } catch (error) {
    console.error('Vercel API handler failed:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : String(error),
      })
    );
  }
}
