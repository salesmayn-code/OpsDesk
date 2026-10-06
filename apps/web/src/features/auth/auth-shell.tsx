import Link from 'next/link';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <Link href="/login" className="text-title font-semibold text-foreground">
            OpsDesk
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="rounded-card border border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
