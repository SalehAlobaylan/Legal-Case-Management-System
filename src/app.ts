// src/app.ts
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';

export function buildApp(opts = {}) {
  const app = Fastify({
    logger: true,
    ...opts
  });

  // Register plugins
  app.register(cors);
  app.register(jwt, { secret: process.env.JWT_SECRET || 'supersecret' });
  app.register(import('./plugins/auth'));
  app.register(import('./plugins/database'));
  app.register(import('./plugins/error-handler'));
  app.register(import('./plugins/swagger'));

  // Register routes
//   app.register(import('./routes/auth'), { prefix: '/api/auth' });
//   app.register(import('./routes/cases'), { prefix: '/api/cases' });
//   app.register(import('./routes/regulations'), { prefix: '/api/regulations' });

  return app;
}


