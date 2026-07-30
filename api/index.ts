// Vercel serverless entry: every /api/* request is rewritten here (see
// vercel.json) and handled by the Express app. Body parsing is left to
// Express so the Stripe webhook can verify its raw payload.
import { app } from '../server/index.js';

export const config = { api: { bodyParser: false } };

export default app;
