import express, { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { corsOrigins, env } from './config/env.js';
import { errorHandler, notFound } from './lib/errors.js';
import { requireAuth } from './middleware/auth.js';
import { authRoutes } from './routes/auth.routes.js';
import { publicRoutes } from './routes/public.routes.js';
import { tableRoutes } from './routes/tables.routes.js';
import { paymentRoutes, sessionRoutes } from './routes/sessions.routes.js';
import { orderRoutes } from './routes/orders.routes.js';
import { catalogRoutes } from './routes/catalog.routes.js';
import { cardRoutes } from './routes/cards.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { adminRoutes } from './routes/admin.routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false, // a CSP do frontend é definida pelo servidor de arquivos estáticos/proxy
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date() });
  });

  const api = Router();
  api.use('/auth', authRoutes);
  api.use('/public', publicRoutes);

  // Daqui para baixo, somente funcionários autenticados. As permissões por perfil ficam em cada rota.
  api.use(requireAuth);
  api.use('/tables', tableRoutes);
  api.use('/sessions', sessionRoutes);
  api.use('/payments', paymentRoutes);
  api.use('/orders', orderRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/cards', cardRoutes);
  api.use('/users', userRoutes);
  api.use('/admin', adminRoutes);
  api.use((_req, _res, next) => next(notFound('Rota não encontrada')));

  app.use('/api', api);
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { maxAge: '7d', fallthrough: false }));

  // Deploy em processo único: serve o build do frontend (SPA) quando habilitado.
  if (env.SERVE_FRONTEND) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dist = path.resolve(here, '../../frontend/dist');
    if (fs.existsSync(dist)) {
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (_req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.sendFile(path.join(dist, 'index.html'));
      });
    } else {
      console.warn(`SERVE_FRONTEND=true, mas ${dist} não existe. Rode "npm run build".`);
    }
  }

  app.use(errorHandler);
  return app;
}
