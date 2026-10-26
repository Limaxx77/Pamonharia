import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  BarChart3,
  Bell,
  ChefHat,
  CreditCard,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Nfc,
  Settings,
  Tags,
  UtensilsCrossed,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { homeFor, useAuth } from '../lib/auth';
import { ROLE } from '../lib/format';
import type { Role } from '../lib/types';
import { DemoBanner, Logo, useSettings } from '../components/brand';
import { Sheet, useToast } from '../components/ui';
import { EVT, useConnectionStatus, useSocketEvent } from '../lib/realtime';
import { chime } from '../lib/sound';
import { padTab, padTable } from '../lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  end?: boolean;
  primary?: boolean; // aparece na barra inferior do celular
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Painel', icon: LayoutDashboard, roles: ['ADMIN'], end: true, primary: true },
  { to: '/app/mesas', label: 'Mesas', icon: LayoutGrid, roles: ['WAITER', 'CASHIER', 'ADMIN'], primary: true },
  { to: '/app/cozinha', label: 'Cozinha', icon: ChefHat, roles: ['KITCHEN', 'ADMIN'], primary: true },
  { to: '/app/caixa', label: 'Caixa', icon: Wallet, roles: ['CASHIER', 'ADMIN'], primary: true },
  { to: '/app/garcom', label: 'Garçom', icon: Bell, roles: ['WAITER', 'ADMIN'], primary: true },
  { to: '/app/relatorios', label: 'Relatórios', icon: BarChart3, roles: ['ADMIN'] },
  { to: '/app/produtos', label: 'Produtos', icon: UtensilsCrossed, roles: ['ADMIN'] },
  { to: '/app/categorias', label: 'Categorias', icon: Tags, roles: ['ADMIN'] },
  { to: '/app/cartoes', label: 'Cartões NFC', icon: Nfc, roles: ['ADMIN'] },
  { to: '/app/funcionarios', label: 'Funcionários', icon: Users, roles: ['ADMIN'] },
  { to: '/app/configuracoes', label: 'Configurações', icon: Settings, roles: ['ADMIN'] },
];

export function StaffLayout() {
  const { user, logout } = useAuth();
  const { data: settings } = useSettings();
  const online = useConnectionStatus();
  const [more, setMore] = useState(false);
  const nav = useNavigate();
  const toast = useToast();

  // Chamados de clientes (pedir conta / chamar garçom) para garçons, caixa e administração
  useSocketEvent<{ kind: 'bill' | 'call'; tabNumber: number; tableNumber?: number | null }>(EVT.WAITER_CALL, (p) => {
    if (!user || user.role === 'KITCHEN') return;
    const where = p.tableNumber ? `Mesa ${padTable(p.tableNumber)} · ` : '';
    chime('ready');
    if (p.kind === 'bill') toast.warning(`${where}Comanda ${padTab(p.tabNumber)} pediu a conta`, 8000);
    else toast.warning(`${where}Comanda ${padTab(p.tabNumber)} está chamando o garçom`, 8000);
  });

  if (!user) return null;
  const items = NAV.filter((i) => i.roles.includes(user.role));
  // Barra inferior: no máximo 4 atalhos (+ "Mais") para caber em telas de 360px
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const secondary = items.filter((i) => !primary.includes(i));
  const showMore = secondary.length > 0;

  const doLogout = async () => {
    await logout();
    nav('/login');
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-bold transition-colors',
      isActive ? 'bg-verde-600 text-white shadow-sm' : 'text-verde-50/85 hover:bg-verde-700 hover:text-white',
    );

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menu lateral (desktop/tablet grande) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-verde-800 p-4 lg:flex">
        <Logo light name={settings?.name} className="px-2 py-1" />
        <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Principal">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={linkCls}>
              <i.icon className="size-5" /> {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 rounded-2xl bg-verde-900/60 p-3 text-verde-50">
          <p className="truncate text-sm font-bold">{user.name}</p>
          <p className="text-xs text-verde-200">{ROLE[user.role]}</p>
          <button onClick={doLogout} className="mt-2 flex items-center gap-2 text-sm font-semibold text-verde-100 hover:text-white">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Topo (celular) */}
      <header className="pt-safe sticky top-0 z-30 bg-verde-800 text-white lg:hidden">
        <DemoBanner />
        <div className="flex h-14 items-center gap-3 px-4">
          <Logo light name={settings?.name} />
          <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-verde-100">
            {online ? <Wifi className="size-4" /> : <WifiOff className="size-4 text-milho-300" />}
            <span className="max-w-24 truncate">{user.name.split(' ')[0]}</span>
          </span>
        </div>
      </header>
      <div className="hidden lg:block">
        <DemoBanner />
      </div>
      {!online && (
        <div role="status" className="sticky top-14 z-20 bg-milho-300 px-4 py-1.5 text-center text-xs font-bold text-marrom-900 lg:top-0">
          Reconectando ao servidor… as telas serão atualizadas automaticamente.
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
        <Outlet />
      </main>

      {/* Navegação inferior (celular) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-marrom-100 bg-white/95 backdrop-blur lg:hidden" aria-label="Principal">
        <div className="mx-auto flex max-w-lg">
          {primary.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                clsx('flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', isActive ? 'text-verde-700' : 'text-marrom-400')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive && 'bg-verde-100')}>
                    <i.icon className="size-5" />
                  </span>
                  {i.label}
                </>
              )}
            </NavLink>
          ))}
          {showMore ? (
            <button onClick={() => setMore(true)} className="flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-marrom-400">
              <span className="flex h-8 w-14 items-center justify-center">
                <MenuIcon className="size-5" />
              </span>
              Mais
            </button>
          ) : (
            <button onClick={doLogout} className="flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-marrom-400">
              <span className="flex h-8 w-14 items-center justify-center">
                <LogOut className="size-5" />
              </span>
              Sair
            </button>
          )}
        </div>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-2 gap-2">
          {secondary.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              onClick={() => setMore(false)}
              className={({ isActive }) =>
                clsx('flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border text-sm font-bold', isActive ? 'border-verde-500 bg-verde-50 text-verde-700' : 'border-marrom-100 bg-white text-marrom-700')
              }
            >
              <i.icon className="size-6" /> {i.label}
            </NavLink>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-4">
          <div>
            <p className="font-bold">{user.name}</p>
            <p className="text-sm text-marrom-500">
              {ROLE[user.role]} · <button className="font-semibold text-verde-700 underline" onClick={() => { setMore(false); nav(homeFor(user.role)); }}>início</button>
            </p>
          </div>
          <button onClick={doLogout} className="flex items-center gap-2 rounded-xl px-3 py-2 font-bold text-rose-700 hover:bg-rose-50">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-marrom-400">
          <CreditCard className="size-3.5" /> Pagamentos registrados aqui não substituem a confirmação da maquininha/PIX.
        </p>
      </Sheet>
    </div>
  );
}
