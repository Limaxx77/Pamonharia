import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './lib/auth';
import type { Role } from './lib/types';
import { Spinner } from './components/ui';
import { Home } from './pages/Home';
import { PublicMenu } from './pages/PublicMenu';
import { CardApp } from './pages/customer/CardApp';
import { Login } from './pages/Login';
import { StaffLayout } from './layouts/StaffLayout';
import { NotFound } from './pages/NotFound';

// Telas internas carregadas sob demanda: o cliente do cartão NFC baixa só o necessário.
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Products = lazy(() => import('./pages/admin/Products'));
const Categories = lazy(() => import('./pages/admin/Categories'));
const Users = lazy(() => import('./pages/admin/Users'));
const Cards = lazy(() => import('./pages/admin/Cards'));
const SettingsPage = lazy(() => import('./pages/admin/Settings'));
const Waiter = lazy(() => import('./pages/staff/Waiter'));
const Tables = lazy(() => import('./pages/staff/Tables'));
const TableDetail = lazy(() => import('./pages/staff/TableDetail'));
const SessionDetail = lazy(() => import('./pages/staff/SessionDetail'));
const WaiterOrder = lazy(() => import('./pages/staff/WaiterOrder'));
const Kitchen = lazy(() => import('./pages/staff/Kitchen'));
const Cashier = lazy(() => import('./pages/staff/Cashier'));
const Checkout = lazy(() => import('./pages/staff/Checkout'));

function Protected({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && user.role !== 'ADMIN' && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

const page = (el: ReactNode, roles?: Role[]) => (
  <Protected roles={roles}>
    <Suspense fallback={<Spinner className="min-h-[50dvh]" />}>{el}</Suspense>
  </Protected>
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/cardapio" element={<PublicMenu />} />
      <Route path="/c/:token" element={<CardApp />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/app"
        element={
          <Protected>
            <StaffLayout />
          </Protected>
        }
      >
        <Route index element={page(<Dashboard />, ['ADMIN'])} />
        <Route path="garcom" element={page(<Waiter />, ['WAITER'])} />
        <Route path="mesas" element={page(<Tables />, ['WAITER', 'CASHIER'])} />
        <Route path="mesas/:id" element={page(<TableDetail />, ['WAITER', 'CASHIER'])} />
        <Route path="comandas/:id" element={page(<SessionDetail />, ['WAITER', 'CASHIER'])} />
        <Route path="comandas/:id/pedido" element={page(<WaiterOrder />, ['WAITER'])} />
        <Route path="cozinha" element={page(<Kitchen />, ['KITCHEN'])} />
        <Route path="caixa" element={page(<Cashier />, ['CASHIER'])} />
        <Route path="caixa/:id" element={page(<Checkout />, ['CASHIER'])} />
        <Route path="relatorios" element={page(<Reports />, ['ADMIN'])} />
        <Route path="produtos" element={page(<Products />, ['ADMIN'])} />
        <Route path="categorias" element={page(<Categories />, ['ADMIN'])} />
        <Route path="funcionarios" element={page(<Users />, ['ADMIN'])} />
        <Route path="cartoes" element={page(<Cards />, ['ADMIN'])} />
        <Route path="configuracoes" element={page(<SettingsPage />, ['ADMIN'])} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
