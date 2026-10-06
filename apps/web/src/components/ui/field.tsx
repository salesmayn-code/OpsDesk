import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-control border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground aria-invalid:border-status-danger-fg',
        className,
      )}
      {...props}
    />
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, htmlFor, error, required, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="text-status-danger-fg" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-status-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
