import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role, User } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const AUTH_COOKIE = 'pm_session';
const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12h — um turno de trabalho

export type AuthUser = Pick<User, 'id' | 'name' | 'email' | 'role'>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  role: Role;
  v: number;
}

export function signToken(user: Pick<User, 'id' | 'role' | 'tokenVersion'>) {
  const payload: TokenPayload = { sub: user.id, role: user.role, v: user.tokenVersion };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

/** Valida o token e confere no banco se o usuário continua ativo e com a mesma versão de sessão. */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as unknown as TokenPayload;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active || user.tokenVersion !== payload.v) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await userFromToken(req.cookies?.[AUTH_COOKIE]);
  if (!user) return next(unauthorized());
  req.user = user;
  next();
}

/** Autoriza apenas os perfis informados. ADMIN tem acesso a tudo. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== 'ADMIN' && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
