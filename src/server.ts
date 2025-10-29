// src/server.ts
import { buildApp } from './app';

const start = async () => {
  try {
    const app = buildApp();
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();