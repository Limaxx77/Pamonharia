import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { conflict } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { requireRole } from '../middleware/auth.js';
import { clientIp, idParam, parseBody } from '../middleware/validate.js';

export const userRoutes = Router();

const publicUser = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

userRoutes.get('/', requireRole('CASHIER', 'WAITER'), async (req, res) => {
  // Funcionários não administradores só enxergam a lista de garçons ativos (para atribuição).
  const isAdmin = req.user!.role === 'ADMIN';
  const users = await prisma.user.findMany({
    where: isAdmin ? {} : { active: true, role: 'WAITER' },
    select: publicUser,
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });
  res.json({ users });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(120),
  role: z.enum(['ADMIN', 'WAITER', 'KITCHEN', 'CASHIER']),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').max(200),
});

userRoutes.post('/', requireRole(), async (req, res) => {
  const data = parseBody(createSchema, req);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('EMAIL_IN_USE', 'E-mail já cadastrado');
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, role: data.role, passwordHash: await bcrypt.hash(data.password, 10) },
    select: publicUser,
  });
  await audit({ userId: req.user!.id, action: 'user.create', entity: 'user', entityId: user.id, data: { email: user.email, role: user.role }, ip: clientIp(req) });
  res.status(201).json({ user });
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(120).optional(),
  role: z.enum(['ADMIN', 'WAITER', 'KITCHEN', 'CASHIER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

userRoutes.patch('/:id', requireRole(), async (req, res) => {
  const id = idParam(req);
  const { password, ...data } = parseBody(updateSchema, req);
  if (id === req.user!.id && (data.active === false || (data.role && data.role !== 'ADMIN'))) {
    throw conflict('SELF_LOCKOUT', 'Você não pode desativar ou rebaixar o próprio usuário');
  }
  if (data.email) {
    const other = await prisma.user.findUnique({ where: { email: data.email } });
    if (other && other.id !== id) throw conflict('EMAIL_IN_USE', 'E-mail já cadastrado');
  }
  // Troca de senha, perfil ou desativação encerra as sessões ativas do usuário.
  const invalidate = password || data.role || data.active === false;
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...data,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      ...(invalidate ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: publicUser,
  });
  await audit({ userId: req.user!.id, action: 'user.update', entity: 'user', entityId: id, data: { ...data, passwordChanged: !!password }, ip: clientIp(req) });
  res.json({ user });
});
