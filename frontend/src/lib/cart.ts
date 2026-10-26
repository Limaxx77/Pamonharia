import { useCallback, useEffect, useMemo, useState } from 'react';
import { newKey } from './api';
import type { Addon, Product } from './types';

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  basePriceCents: number;
  addons: Addon[];
  quantity: number;
  note: string;
}

interface CartState {
  lines: CartLine[];
  /** Chave de idempotência do envio em andamento: reaproveitada em novas tentativas do MESMO carrinho */
  pendingKey: string | null;
}

const empty: CartState = { lines: [], pendingKey: null };

function load(storageKey: string): CartState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as CartState;
    return Array.isArray(parsed.lines) ? parsed : empty;
  } catch {
    return empty;
  }
}

export const unitPrice = (l: Pick<CartLine, 'basePriceCents' | 'addons'>) =>
  l.basePriceCents + l.addons.reduce((s, a) => s + a.priceCents, 0);

export const effectivePrice = (p: Pick<Product, 'priceCents' | 'promoPriceCents'>) => p.promoPriceCents ?? p.priceCents;

/**
 * Carrinho local, salvo no aparelho por contexto (cartão ou atendimento).
 * Os itens só entram na comanda depois da confirmação do pedido.
 */
export function useCart(storageKey: string) {
  const [store, setStore] = useState(() => ({ key: storageKey, ...load(storageKey) }));
  // Trocou o contexto (outro cartão/atendimento): carrega o carrinho correspondente
  if (store.key !== storageKey) setStore({ key: storageKey, ...load(storageKey) });
  const state: CartState = store;

  useEffect(() => {
    if (store.key !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ lines: store.lines, pendingKey: store.pendingKey }));
    } catch {
      /* armazenamento indisponível (aba anônima etc.) — o carrinho continua em memória */
    }
  }, [storageKey, store]);

  const setState = useCallback(
    (fn: CartState | ((s: CartState) => CartState)) =>
      setStore((s) => ({ key: s.key, ...(typeof fn === 'function' ? fn(s) : fn) })),
    [],
  );

  // Qualquer alteração no carrinho gera um novo pedido (nova chave de idempotência)
  const mutate = useCallback(
    (fn: (lines: CartLine[]) => CartLine[]) => setState((s) => ({ lines: fn(s.lines), pendingKey: null })),
    [setState],
  );

  const add = useCallback(
    (product: Product, quantity: number, addons: Addon[], note: string) => {
      mutate((lines) => {
        const sameIdx = lines.findIndex(
          (l) =>
            l.productId === product.id &&
            l.note === note &&
            l.addons.map((a) => a.id).sort().join() === addons.map((a) => a.id).sort().join(),
        );
        if (sameIdx >= 0) {
          return lines.map((l, i) => (i === sameIdx ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l));
        }
        return [
          ...lines,
          {
            key: newKey(),
            productId: product.id,
            name: product.name,
            imageUrl: product.imageUrl,
            basePriceCents: effectivePrice(product),
            addons,
            quantity,
            note,
          },
        ];
      });
    },
    [mutate],
  );

  const setQty = useCallback(
    (key: string, quantity: number) =>
      mutate((lines) => (quantity <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l)))),
    [mutate],
  );
  const setNote = useCallback((key: string, note: string) => mutate((lines) => lines.map((l) => (l.key === key ? { ...l, note } : l))), [mutate]);
  const remove = useCallback((key: string) => mutate((lines) => lines.filter((l) => l.key !== key)), [mutate]);
  const clear = useCallback(() => setState(empty), [setState]);

  /** Retorna a chave de idempotência para este envio (cria se necessário) */
  const checkoutKey = useCallback(() => {
    let key = state.pendingKey;
    if (!key) {
      key = newKey();
      const k = key;
      setState((s) => ({ ...s, pendingKey: k }));
    }
    return key;
  }, [state.pendingKey, setState]);

  const totals = useMemo(() => {
    const count = state.lines.reduce((s, l) => s + l.quantity, 0);
    const subtotal = state.lines.reduce((s, l) => s + unitPrice(l) * l.quantity, 0);
    return { count, subtotal };
  }, [state.lines]);

  const payload = useCallback(
    () =>
      state.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        addonIds: l.addons.map((a) => a.id),
        note: l.note.trim() || null,
      })),
    [state.lines],
  );

  return { lines: state.lines, ...totals, add, setQty, setNote, remove, clear, checkoutKey, payload };
}

export type Cart = ReturnType<typeof useCart>;
