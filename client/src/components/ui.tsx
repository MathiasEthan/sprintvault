import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/*
 * Shared building blocks. Colour roles:
 *   green (blue-* in Tailwind, remapped)  actions, your work, done
 *   amber                                 a lock is held
 *   rose                                  revoke, errors
 * Radius: 4px controls, 6px raised surfaces. No shadows; elevation = graphite on ink.
 */

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500',
  secondary: 'border border-slate-700 text-slate-100 hover:border-slate-500 hover:bg-slate-900',
  quiet: 'text-slate-400 hover:text-slate-100',
  danger: 'border border-rose-900 text-rose-300 hover:bg-rose-950',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md'; block?: boolean }
> = ({ variant = 'secondary', size = 'md', block, className = '', children, ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors disabled:cursor-not-allowed ${
      variant === 'quiet' ? (size === 'sm' ? 'text-xs' : 'text-sm') : size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm'
    } ${block ? 'w-full' : ''} ${buttonStyles[variant]} ${className}`}
  >
    {children}
  </button>
);

export const inputClass =
  'w-full h-8 rounded border border-slate-700 bg-slate-950 px-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none';

export const Field: React.FC<{ label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }> = ({
  label,
  hint,
  htmlFor,
  children,
}) => (
  <div className="space-y-1">
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-300">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);

export const Notice: React.FC<{ tone?: 'error' | 'info'; children: React.ReactNode }> = ({ tone = 'error', children }) => (
  <div
    role={tone === 'error' ? 'alert' : undefined}
    className={`border-l-2 py-1.5 pl-3 text-sm ${tone === 'error' ? 'border-rose-500 text-rose-200' : 'border-slate-600 text-slate-300'}`}
  >
    {children}
  </div>
);

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded border border-slate-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-sm px-3 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Modal: React.FC<{
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ title, description, onClose, children, footer, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-4xl' : 'max-w-md'} rounded-md border border-slate-800 bg-slate-900`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <h2 className="text-base font-semibold text-slate-50">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-1 rounded p-1 text-slate-500 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const PageHeader: React.FC<{ title: string; meta?: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  meta,
  actions,
}) => (
  <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="font-display break-words text-xl text-slate-50 sm:truncate">{title}</h1>
      {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">{meta}</div>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

/** Scope paths are stored without a trailing slash; show folders as `src/auth/` so they don't read as words. */
export function displayScope(path: string): string {
  if (path === '/') return 'whole repository';
  const last = path.split('/').pop() || '';
  return last.includes('.') ? path : `${path}/`;
}

/** Code-like content (paths, SHAs, branches). Never used for labels. */
export const Code: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <code className={`font-mono text-[12px] text-slate-200 ${className}`}>{children}</code>
);

export const Spinner: React.FC<{ label: string }> = ({ label }) => (
  <p className="py-16 text-sm text-slate-500" aria-live="polite">
    {label}
  </p>
);
