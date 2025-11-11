// src/app.ts
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
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
  app.register(import('./plugins/database'));
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Legal Case Management API',
        version: '1.0.0'
      }
    }
  });

  // Register routes
//   app.register(import('./routes/auth'), { prefix: '/api/auth' });
//   app.register(import('./routes/cases'), { prefix: '/api/cases' });
//   app.register(import('./routes/regulations'), { prefix: '/api/regulations' });

  return app;
}


