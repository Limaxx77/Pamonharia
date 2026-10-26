import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <img src="/images/fallback.svg" alt="" className="w-48" />
      <h1 className="mt-4 text-3xl font-bold">Página não encontrada</h1>
      <p className="mt-1 text-marrom-600">O endereço acessado não existe ou foi movido.</p>
      <Link to="/" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-verde-600 px-6 font-bold text-white">
        Ir para o início
      </Link>
    </div>
  );
}
