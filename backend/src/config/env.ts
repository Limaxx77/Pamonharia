import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  /** Origem(ns) do frontend autorizadas no CORS, separadas por vírgula */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** URL pública usada para montar os links gravados nos cartões NFC */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  /** Em produção, o backend pode servir o build do frontend (deploy em processo único) */
  SERVE_FRONTEND: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  UPLOAD_DIR: z.string().default('uploads'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
