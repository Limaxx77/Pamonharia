import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, post } from './api';
import { resetSocket } from './realtime';
import type { Role, User } from './types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    // Sessão expirada: volta ao login. Não limpa o cache inteiro — isso derrubaria consultas
    // públicas em andamento (cardápio, cartão) e a tela nunca seria atualizada.
    const expired = () => setUser(null);
    window.addEventListener('auth:expired', expired);
    return () => window.removeEventListener('auth:expired', expired);
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await post<{ user: User }>('/auth/login', { email, password });
    resetSocket();
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    resetSocket();
    qc.clear();
    setUser(null);
  }, [qc]);

  const can = useCallback((...roles: Role[]) => !!user && (user.role === 'ADMIN' || roles.includes(user.role)), [user]);

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}

/** Tela inicial de cada perfil após o login */
export function homeFor(role: Role) {
  switch (role) {
    case 'ADMIN':
      return '/app';
    case 'WAITER':
      return '/app/garcom';
    case 'KITCHEN':
      return '/app/cozinha';
    case 'CASHIER':
      return '/app/caixa';
  }
}
