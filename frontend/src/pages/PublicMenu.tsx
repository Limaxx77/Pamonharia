import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Nfc } from 'lucide-react';
import { DemoBanner, Logo, useMenu, useSettings } from '../components/brand';
import { MenuBrowser, ProductSheet } from '../components/menu';
import { ErrorBox, Spinner } from '../components/ui';
import type { Product } from '../lib/types';

/** Cardápio para consulta (sem comanda): mostra tudo, mas pedidos só pela comanda ou garçom. */
export function PublicMenu() {
  const { data: settings } = useSettings();
  const { data: categories, isLoading, error, refetch } = useMenu();
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    if (!categories || !location.hash) return;
    const slug = location.hash.slice(1);
    const cat = categories.find((c) => c.slug === slug);
    if (cat) setTimeout(() => document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth' }), 150);
  }, [categories]);

  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 bg-verde-800 text-white">
        <DemoBanner />
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <Link to="/" aria-label="Voltar ao início" className="-ml-2 rounded-full p-2 hover:bg-white/10">
            <ArrowLeft className="size-5" />
          </Link>
          <Logo light name={settings?.name} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-milho-100 p-4 text-sm text-marrom-800">
          <Nfc className="mt-0.5 size-5 shrink-0 text-verde-700" />
          <p>
            <strong>Para pedir</strong>, aproxime o celular da sua comanda NFC (ou leia o QR Code dela) ou chame um garçom. Aqui você pode consultar o cardápio e os preços.
          </p>
        </div>
        {isLoading && <Spinner />}
        {error && (
          <div className="mt-4">
            <ErrorBox onRetry={() => refetch()}>Não foi possível carregar o cardápio.</ErrorBox>
          </div>
        )}
        {categories && <MenuBrowser categories={categories} canOrder={false} onSelect={setSelected} stickyTop={56} />}
      </main>
      <ProductSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
