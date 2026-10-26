/** Base da API. Em desenvolvimento o Vite faz proxy de /api; em produção, mesmo domínio ou VITE_API_URL. */
export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function api<T>(path: string, opts: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: opts.body !== undefined && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body instanceof FormData ? opts.body : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    // Sessão de funcionário expirou durante o uso (não se aplica à checagem inicial nem às rotas públicas)
    if (res.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public')) {
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Erro inesperado', err?.details);
  }
  return data as T;
}

export const post = <T>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_ERROR') {
      const d = e.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
      const first = d?.formErrors?.[0] ?? Object.values(d?.fieldErrors ?? {})[0]?.[0];
      return first ? `Dados inválidos: ${first}` : e.message;
    }
    return e.message;
  }
  return 'Algo deu errado. Tente novamente.';
}

/** Chave de idempotência para pedidos/pagamentos (evita duplicidade em reenvios). */
export function newKey() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
