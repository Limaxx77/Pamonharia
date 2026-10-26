import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, Loader2, Minus, Plus, X, XCircle } from 'lucide-react';

// ------------------------------------------------------------------ Button

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-verde-600 text-white hover:bg-verde-700 active:bg-verde-800 shadow-sm',
  accent: 'bg-milho-400 text-marrom-900 hover:bg-milho-300 active:bg-milho-500 shadow-sm',
  secondary: 'bg-verde-50 text-verde-800 hover:bg-verde-100 active:bg-verde-200',
  outline: 'border border-marrom-100 bg-white text-marrom-700 hover:bg-marrom-50',
  ghost: 'text-marrom-700 hover:bg-marrom-50 active:bg-marrom-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 shadow-sm',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-4 text-[15px] rounded-xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex select-none items-center justify-center font-bold transition-colors disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx('inline-flex size-11 items-center justify-center rounded-full text-marrom-700 transition-colors hover:bg-marrom-50 active:bg-marrom-100', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Badge

export type Tone = 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'brown' | 'corn';
const tones: Record<Tone, string> = {
  green: 'bg-verde-100 text-verde-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800',
  red: 'bg-rose-100 text-rose-800',
  gray: 'bg-stone-100 text-stone-600',
  brown: 'bg-marrom-100 text-marrom-700',
  corn: 'bg-milho-200 text-marrom-900',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', tones[tone], className)}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ Card / layout

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-2xl border border-marrom-100/70 bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-marrom-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-marrom-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className, label = 'Carregando' }: { className?: string; label?: string }) {
  return (
    <div role="status" className={clsx('flex items-center justify-center py-10 text-verde-600', className)}>
      <Loader2 className="size-7 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-marrom-300">{icon}</div>}
      <p className="font-display text-lg font-semibold text-marrom-700">{title}</p>
      {children && <div className="mt-1 text-sm text-marrom-500">{children}</div>}
    </div>
  );
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
      <XCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Form

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-bold text-marrom-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-marrom-500">{hint}</p>}
      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
}

const inputBase =
  'w-full rounded-xl border border-marrom-100 bg-white px-3.5 text-marrom-900 placeholder:text-marrom-300 transition-colors focus:border-verde-500 focus:outline-none focus:ring-2 focus:ring-verde-500/25 disabled:bg-stone-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputBase, 'h-12', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(inputBase, 'min-h-20 py-3', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputBase, 'h-12 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23754C29' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-verde-600' : 'bg-stone-300')}
    >
      <span className={clsx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 50, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md' }) {
  const btn = size === 'sm' ? 'size-8' : 'size-11';
  return (
    <div className="inline-flex items-center rounded-full border border-marrom-100 bg-white">
      <button type="button" aria-label="Diminuir" className={clsx(btn, 'flex items-center justify-center rounded-full text-verde-700 hover:bg-verde-50 disabled:opacity-40')} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        <Minus className="size-4" />
      </button>
      <span className={clsx('tabular min-w-7 text-center font-extrabold', size === 'sm' ? 'text-sm' : 'text-base')} aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="Aumentar" className={clsx(btn, 'flex items-center justify-center rounded-full text-verde-700 hover:bg-verde-50 disabled:opacity-40')} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Sheet (bottom sheet no celular, modal no desktop)

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-marrom-900/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-3xl bg-creme shadow-float outline-none sm:animate-pop sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-marrom-100 sm:hidden" aria-hidden />
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3">
            <h2 id={titleId} className="min-w-0 text-xl font-bold text-marrom-900">
              {title}
            </h2>
            <IconButton label="Fechar" onClick={onClose} className="-mr-2">
              <X className="size-5" />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="pb-safe shrink-0 border-t border-marrom-100 bg-white/80 px-5 py-3 backdrop-blur sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Diálogo de confirmação, com campo de motivo opcional (cancelamentos, estornos, reaberturas). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  danger,
  reason,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  reason?: { label: string; required?: boolean; placeholder?: string };
  onConfirm: (reason: string) => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) {
      setText('');
      setErr('');
    }
  }, [open]);
  const submit = async () => {
    if (reason?.required && text.trim().length < 3) {
      setErr('Informe o motivo (mínimo 3 caracteres)');
      return;
    }
    setBusy(true);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" block onClick={onClose}>
            Voltar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} block loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message && <div className="text-marrom-700">{message}</div>}
      {reason && (
        <div className="mt-4">
          <Field label={reason.label} error={err}>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} maxLength={200} autoFocus />
          </Field>
        </div>
      )}
      {!reason && err && <p className="mt-3 text-sm font-semibold text-rose-700">{err}</p>}
    </Sheet>
  );
}

// ------------------------------------------------------------------ Toasts

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: ReactNode;
}
const ToastCtx = createContext<(kind: ToastKind, text: ReactNode, ms?: number) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: ToastKind, text: ReactNode, ms = 3500) => {
    const id = ++seq.current;
    setItems((s) => [...s.slice(-3), { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), ms);
  }, []);
  const icon = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
  const style = {
    success: 'bg-verde-700 text-white',
    error: 'bg-rose-700 text-white',
    info: 'bg-marrom-900 text-white',
    warning: 'bg-milho-400 text-marrom-900',
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 pt-safe">
          {items.map((t) => {
            const Icon = icon[t.kind];
            return (
              <div key={t.id} className={clsx('pointer-events-auto flex w-full max-w-md animate-pop items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-float', style[t.kind])}>
                <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">{t.text}</div>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return {
    success: (t: ReactNode, ms?: number) => push('success', t, ms),
    error: (t: ReactNode, ms?: number) => push('error', t, ms ?? 5000),
    info: (t: ReactNode, ms?: number) => push('info', t, ms),
    warning: (t: ReactNode, ms?: number) => push('warning', t, ms),
  };
}

// ------------------------------------------------------------------ Tabs (segmentado)

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-marrom-50 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex h-10 shrink-0 grow items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition-colors',
            value === o.value ? 'bg-white text-verde-700 shadow-sm' : 'text-marrom-600 hover:text-marrom-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatTile({ label, value, hint, icon, tone = 'green' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'green' | 'corn' | 'brown' | 'blue' }) {
  const ring = { green: 'bg-verde-50 text-verde-700', corn: 'bg-milho-100 text-milho-700', brown: 'bg-marrom-50 text-marrom-600', blue: 'bg-sky-50 text-sky-700' }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-marrom-500">{label}</p>
        {icon && <span className={clsx('rounded-xl p-2', ring)}>{icon}</span>}
      </div>
      <p className="tabular mt-1 font-display text-2xl font-bold text-marrom-900 sm:text-[28px]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-marrom-500">{hint}</p>}
    </Card>
  );
}
