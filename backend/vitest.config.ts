import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Os testes usam um banco PRÓPRIO (.env.test), que é apagado a cada execução.
const env = config({ path: '.env.test' }).parsed ?? {};

export default defineConfig({
  test: {
    env: { ...env, NODE_ENV: 'test' },
    globalSetup: './tests/global-setup.ts',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
