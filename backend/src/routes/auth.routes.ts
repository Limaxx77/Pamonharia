import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { AUTH_COOKIE, clearAuthCookie, requireAuth, setAuthCookie, signToken, userFromToken } from '../middleware/auth.js';
import { clientIp, parseBody } from '../middleware/validate.js';

export const authRoutes = Router();

const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  // Só tentativas que falharam contam: a equipe inteira costuma sair pelo mesmo IP do Wi-Fi da loja.
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde alguns minutos.' } },
  skip: () => process.env.NODE_ENV === 'test',
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(1).max(200),
});

authRoutes.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parseBody(loginSchema, req);
  const user = await prisma.user.findUnique({ where: { email } });
  // Compara sempre com um hash para não revelar, pelo tempo de resposta, se o e-mail existe.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    await audit({ userId: user?.id, action: 'auth.login_failed', entity: 'user', entityId: user?.id, data: { email }, ip: clientIp(req) });
    throw unauthorized('E-mail ou senha inválidos');
  }
  setAuthCookie(res, signToken(user));
  await audit({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ip: clientIp(req) });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRoutes.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/** Sessão atual: { user: null } para visitantes (não é erro — o cliente do cartão NFC não tem login). */
authRoutes.get('/me', async (req, res) => {
  res.json({ user: await userFromToken(req.cookies?.[AUTH_COOKIE]) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres').max(200),
});

authRoutes.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw unauthorized('Senha atual incorreta');
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
  });
  setAuthCookie(res, signToken(updated));
  await audit({ userId: user.id, action: 'auth.change_password', entity: 'user', entityId: user.id, ip: clientIp(req) });
  res.json({ ok: true });
});
