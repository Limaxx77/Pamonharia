import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LogIn } from 'lucide-react';
import { homeFor, useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { DemoBanner, Logo, useSettings } from '../components/brand';
import { Button, Field, Input } from '../components/ui';

const DEMO_USERS = [
  { email: 'admin@demo.com', label: 'Administrador' },
  { email: 'garcom@demo.com', label: 'Garçom' },
  { email: 'cozinha@demo.com', label: 'Cozinha' },
  { email: 'caixa@demo.com', label: 'Caixa' },
];

export function Login() {
  const { user, login } = useAuth();
  const { data: settings } = useSettings();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      nav(loc.state?.from?.startsWith('/app') ? loc.state.from : homeFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-verde-800">
      <DemoBanner />
      <div className="pt-safe flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Link to="/" className="mb-6 flex items-center gap-1.5 text-sm font-semibold text-verde-100 hover:text-white">
          <ArrowLeft className="size-4" /> Voltar ao início
        </Link>
        <div className="w-full max-w-sm rounded-3xl bg-creme p-6 shadow-float sm:p-8">
          <Logo name={settings?.name} />
          <h1 className="mt-6 text-2xl font-bold">Acesso da equipe</h1>
          <p className="text-sm text-marrom-600">Entre com seu e-mail e senha.</p>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="E-mail" htmlFor="email">
              <Input id="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Senha" htmlFor="password">
              <div className="relative">
                <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-12" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-marrom-400 hover:text-marrom-700">
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </Field>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" block loading={busy}>
              <LogIn className="size-5" /> Entrar
            </Button>
          </form>
          {settings?.demoMode && (
            <div className="mt-6 rounded-2xl border border-dashed border-milho-500 bg-milho-50 p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-marrom-600">Acessos de demonstração · senha demo1234</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword('demo1234');
                    }}
                    className="rounded-xl bg-white px-2 py-2 text-sm font-bold text-verde-700 shadow-sm hover:bg-verde-50"
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
