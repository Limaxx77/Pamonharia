import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { api } from '../lib/api';
import type { Category, Settings } from '../lib/types';
import { EVT, useLiveQueries } from '../lib/realtime';

export function Logo({ className, light, name }: { className?: string; light?: boolean; name?: string }) {
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-2', className)}>
      <img src="/icon.svg" alt="" className="size-9 shrink-0 rounded-xl shadow-sm" />
      <span className={clsx('truncate font-display text-lg font-bold leading-tight', light ? 'text-white' : 'text-verde-800')}>{name ?? 'Pamonharia'}</span>
    </span>
  );
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/public/settings'), staleTime: 60_000 });
}

export function useMenu() {
  useLiveQueries([EVT.MENU_UPDATED], [['menu'], ['settings']]);
  return useQuery({ queryKey: ['menu'], queryFn: () => api<{ categories: Category[] }>('/public/menu').then((r) => r.categories) });
}

/** Faixa que identifica o ambiente de demonstração (dados fictícios). */
export function DemoBanner() {
  const { data } = useSettings();
  if (!data?.demoMode) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 bg-milho-400 px-3 py-1 text-center text-xs font-extrabold text-marrom-900">
      <FlaskConical className="size-3.5" aria-hidden /> AMBIENTE DE DEMONSTRAÇÃO · dados e valores fictícios
    </div>
  );
}
