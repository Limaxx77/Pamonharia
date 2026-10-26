import { execSync } from 'node:child_process';
import { config } from 'dotenv';

export default function setup() {
  const env = config({ path: '.env.test' }).parsed;
  if (!env?.DATABASE_URL) throw new Error('Crie backend/.env.test com DATABASE_URL de um banco exclusivo para testes');
  if (!/test/i.test(env.DATABASE_URL)) throw new Error('Por segurança, o nome do banco de testes deve conter "test"');
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: env.DATABASE_URL }, stdio: 'inherit' });
}
