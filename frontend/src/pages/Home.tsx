import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, Image as ImageIcon, LogIn, MapPin, Nfc, Phone, ShoppingBag, Smartphone, Sparkles } from 'lucide-react';
import { DemoBanner, Logo, useMenu, useSettings } from '../components/brand';
import { Price, ProductImage } from '../components/menu';
import { Sheet } from '../components/ui';

interface Credit {
  image: string;
  file: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  source: string;
}

export function CreditsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['credits'],
    queryFn: () => fetch('/images/products/credits.json').then((r) => r.json() as Promise<Credit[]>),
    enabled: open,
    staleTime: Infinity,
  });
  return (
    <Sheet open={open} onClose={onClose} title="Créditos das imagens">
      <p className="mb-3 text-sm text-marrom-600">
        Fotografias do Wikimedia Commons, usadas conforme suas licenças. Imagens marcadas como “Ilustração” foram criadas para esta demonstração.
      </p>
      <ul className="space-y-2 text-sm">
        {data?.map((c) => (
          <li key={c.image} className="rounded-xl bg-white p-3">
            <a href={c.source} target="_blank" rel="noreferrer" className="font-bold text-verde-700 underline">
              {c.file}
            </a>
            <p className="text-marrom-600">
              {c.author || 'Autor não informado'} ·{' '}
              {c.licenseUrl ? (
                <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="underline">
                  {c.license}
                </a>
              ) : (
                c.license
              )}
            </p>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function Home() {
  const { data: settings } = useSettings();
  const { data: categories } = useMenu();
  const [credits, setCredits] = useState(false);
  const featured = categories?.flatMap((c) => c.products).filter((p) => p.featured).slice(0, 6) ?? [];

  return (
    <div className="min-h-dvh">
      <DemoBanner />
      <header className="pt-safe absolute inset-x-0 z-10 mt-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo light name={settings?.name} />
          <Link to="/login" className="flex h-10 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold text-white backdrop-blur hover:bg-white/25">
            <LogIn className="size-4" /> Equipe
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-verde-800 text-white">
        <ProductImage src="/images/products/pamonha-piracicaba-2-960.jpg" alt="" eager sizes="100vw" className="absolute inset-0 h-full w-full opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-t from-verde-900 via-verde-900/70 to-verde-900/30" />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-28 sm:pb-20 sm:pt-36">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-milho-400 px-3 py-1 text-xs font-extrabold text-marrom-900">
            <Sparkles className="size-3.5" /> Feita na hora, com milho verde
          </span>
          <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.1] sm:text-6xl">{settings?.name ?? 'Pamonharia'}</h1>
          <p className="mt-3 max-w-lg text-lg text-verde-50/90">{settings?.tagline || 'Pamonhas, curau, canjica e o melhor do milho, do jeito de casa.'}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link to="/cardapio" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-milho-400 px-6 text-base font-extrabold text-marrom-900 shadow-float transition-transform hover:bg-milho-300 active:scale-[0.98]">
              <ShoppingBag className="size-5" /> Ver cardápio
            </Link>
            <a href="#como-funciona" className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/30 px-6 font-bold text-white hover:bg-white/10">
              <Nfc className="size-5" /> Como pedir pela comanda
            </a>
          </div>
        </div>
      </section>

      {/* Categorias */}
      {categories && (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="text-2xl font-bold sm:text-3xl">Nosso cardápio</h2>
          <p className="text-marrom-600">Escolha uma categoria</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {categories.map((c) => (
              <Link key={c.id} to={`/cardapio#${c.slug}`} className="group relative aspect-[4/3] overflow-hidden rounded-2xl shadow-card">
                <ProductImage src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 640px) 50vw, 25vw" />
                <div className="absolute inset-0 bg-gradient-to-t from-marrom-900/85 via-marrom-900/20 to-transparent" />
                <span className="absolute inset-x-3 bottom-3 font-display text-base font-bold leading-tight text-white sm:text-lg">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Destaques */}
      {featured.length > 0 && (
        <section className="bg-creme-escuro/60 py-10">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-2xl font-bold sm:text-3xl">Os queridinhos</h2>
              <Link to="/cardapio" className="flex items-center gap-1 text-sm font-bold text-verde-700">
                Ver tudo <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {featured.map((p) => (
                <Link to="/cardapio" key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-card">
                  <ProductImage src={p.imageUrl} alt={p.name} className="aspect-[4/3] w-full" sizes="(max-width: 640px) 50vw, 33vw" />
                  <div className="p-3">
                    <p className="line-clamp-1 font-extrabold">{p.name}</p>
                    <Price product={p} className="text-sm" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-12">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Peça direto da sua mesa</h2>
            <p className="mt-2 text-marrom-600">Ao chegar, você recebe uma comanda com chip NFC. Ela é a sua conta durante toda a visita.</p>
            <ol className="mt-6 space-y-4">
              {[
                { icon: Smartphone, t: 'Aproxime o celular da comanda', d: 'O cardápio abre sozinho no navegador. No iPhone, encoste a parte de cima do aparelho; no Android, deixe o NFC ligado. Se preferir, use o QR Code.' },
                { icon: ShoppingBag, t: 'Escolha e confirme', d: 'Monte o pedido com adicionais e observações. Ele vai direto para a cozinha.' },
                { icon: Clock, t: 'Acompanhe e peça a conta', d: 'Veja o status de cada pedido e o valor parcial da comanda. Na saída, é só pagar no caixa.' },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-verde-600 font-display text-lg font-bold text-white">{i + 1}</span>
                  <div>
                    <p className="flex items-center gap-2 font-extrabold">
                      <s.icon className="size-4 text-verde-600" /> {s.t}
                    </p>
                    <p className="text-sm text-marrom-600">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 rounded-2xl bg-white p-4 text-sm text-marrom-600 shadow-card">
              Prefere ser atendido? Sem problemas: nossos garçons também lançam os pedidos na sua comanda.
            </p>
          </div>
          <div className="overflow-hidden rounded-3xl shadow-float">
            <ProductImage src="/images/products/mingau-milho-960.jpg" alt="Espigas de milho verde sendo preparadas" className="aspect-[4/5] w-full" sizes="(max-width: 768px) 100vw, 50vw" />
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="bg-verde-900 text-verde-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3">
          <div>
            <Logo light name={settings?.name} />
            <p className="mt-3 text-sm text-verde-200">{settings?.tagline}</p>
          </div>
          <ul className="space-y-2 text-sm">
            {settings?.address && (
              <li className="flex gap-2">
                <MapPin className="size-4 shrink-0" /> {settings.address}
              </li>
            )}
            {settings?.openingHours && (
              <li className="flex gap-2">
                <Clock className="size-4 shrink-0" /> {settings.openingHours}
              </li>
            )}
            {settings?.phone && (
              <li className="flex gap-2">
                <Phone className="size-4 shrink-0" /> {settings.phone}
              </li>
            )}
          </ul>
          <div className="space-y-2 text-sm sm:text-right">
            <Link to="/login" className="inline-flex items-center gap-1.5 font-bold text-milho-300 hover:text-milho-200">
              <LogIn className="size-4" /> Acesso da equipe
            </Link>
            <br />
            <button onClick={() => setCredits(true)} className="inline-flex items-center gap-1.5 text-verde-200 hover:text-white">
              <ImageIcon className="size-4" /> Créditos das imagens
            </button>
          </div>
        </div>
      </footer>
      <CreditsSheet open={credits} onClose={() => setCredits(false)} />
    </div>
  );
}
