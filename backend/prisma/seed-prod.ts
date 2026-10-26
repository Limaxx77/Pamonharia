/**
 * Inicialização de PRODUÇÃO: cria apenas as configurações e o primeiro administrador.
 * Não cria produtos, mesas, comandas nem vendas — cadastre tudo pelo painel administrativo.
 *
 * Uso: ADMIN_NAME="Fulano" ADMIN_EMAIL=dono@exemplo.com ADMIN_PASSWORD='senha-forte' npm run seed:prod
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrador';
  if (!email || !password || password.length < 10) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 10 caracteres).');
    process.exit(1);
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: { demoMode: false },
    create: { id: 1, name: process.env.STORE_NAME || 'Pamonharia', demoMode: false },
  });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuário ${email} já existe — nada a fazer.`);
    return;
  }
  await prisma.user.create({
    data: { name, email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`✅ Administrador ${email} criado. Acesse o painel e cadastre cardápio, mesas e cartões.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
