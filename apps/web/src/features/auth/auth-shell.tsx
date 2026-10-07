import Link from 'next/link';
import { Layers, ShieldCheck, Timer } from 'lucide-react';

const HIGHLIGHTS = [
  {
    icon: Timer,
    title: 'Automated SLA timers',
    description: 'Warn, escalate, and breach on policy — evaluated every minute.',
  },
  {
    icon: ShieldCheck,
    title: 'Audit-proof state machines',
    description: 'Every transition is validated and written to an immutable audit log.',
  },
  {
    icon: Layers,
    title: 'ITIL service catalog',
    description: 'Tickets, incidents, changes, and requests in one operational workspace.',
  },
];

const TRUST_BADGES = ['WCAG 2.2 AA accessible', 'Role-based access control', 'Full audit trail'];

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
    <main className="grid min-h-dvh lg:grid-cols-2">
      <aside
        className="relative hidden overflow-hidden bg-[#0b1220] p-10 text-white lg:flex lg:flex-col lg:justify-between"
        aria-label="About OpsDesk"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(55% 45% at 15% 10%, rgba(47, 91, 234, 0.45), transparent 70%), radial-gradient(45% 40% at 90% 95%, rgba(47, 91, 234, 0.25), transparent 70%)',
          }}
        />
        <div className="relative">
          <Link href="/login" className="text-title font-semibold tracking-tight">
            OpsDesk
          </Link>
          <h2 className="mt-14 max-w-md text-3xl font-semibold leading-snug tracking-tight">
            The service desk that runs on operational clarity.
          </h2>
          <ul className="mt-10 max-w-md space-y-6">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight.title} className="flex gap-3">
                <highlight.icon
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#93b0ff]"
                />
                <div>
                  <p className="text-sm font-medium">{highlight.title}</p>
                  <p className="mt-0.5 text-sm text-slate-300">{highlight.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <ul className="relative flex flex-wrap gap-2" aria-label="Platform guarantees">
          {TRUST_BADGES.map((badge) => (
            <li
              key={badge}
              className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-200"
            >
              {badge}
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="mb-6 text-center">
            <Link href="/login" className="text-title font-semibold text-foreground lg:hidden">
              OpsDesk
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight lg:mt-0">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <div className="rounded-card border border-border bg-card p-6 shadow-sm">{children}</div>
        </div>
      </section>
    </main>
  );
}
