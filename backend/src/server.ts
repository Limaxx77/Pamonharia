import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime/io.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const server = createServer(app);
initRealtime(server);

server.listen(env.PORT, () => {
  console.log(`🌽 API da Pamonharia rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
