'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Plus } from 'lucide-react';
import type { PermissionKey } from '@opsdesk/contracts';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/global-search';
import { NotificationBell } from '@/components/notification-bell';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  permission?: PermissionKey;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Service desk',
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/tickets', label: 'Tickets' },
      { href: '/incidents', label: 'Incidents', permission: 'incident:view' },
      { href: '/changes', label: 'Changes', permission: 'change:view' },
    ],
  },
  {
    title: 'Assets',
    items: [
      { href: '/assets', label: 'All assets', permission: 'asset:view_all' },
      { href: '/my/assets', label: 'My assets' },
    ],
  },
  {
    title: 'People & process',
    items: [
      { href: '/workflows', label: 'Workflows', permission: 'workflow:view' },
      { href: '/kb', label: 'Knowledge', permission: 'kb:view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/admin/users', label: 'Users', permission: 'user:view' },
      { href: '/admin/catalog', label: 'Catalog', permission: 'category:manage' },
      { href: '/admin/sla', label: 'SLA policies', permission: 'sla:manage' },
      { href: '/reports', label: 'Reports', permission: 'reports:view' },
      { href: '/admin/audit', label: 'Audit log', permission: 'audit:view' },
    ],
  },
];

const QUICK_ACTIONS: { href: string; label: string; permission: PermissionKey }[] = [
  { href: '/tickets/new', label: 'New ticket', permission: 'ticket:create' },
  { href: '/incidents/new', label: 'Declare incident', permission: 'incident:create' },
  { href: '/changes/new', label: 'New change', permission: 'change:create' },
  { href: '/assets/new', label: 'Register asset', permission: 'asset:create' },
  { href: '/workflows/new', label: 'New workflow', permission: 'workflow:create' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setDrawerOpen(false);
    setQuickOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!quickRef.current?.contains(event.target as Node)) setQuickOpen(false);
      if (!userRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (loading || !user) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((group) => group.items.length > 0);
  const quickActions = QUICK_ACTIONS.filter((action) => can(action.permission));
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  const primaryRole = user.roles[0]?.name ?? 'User';

  const sidebar = (mobile: boolean) => (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full flex-col gap-4 overflow-y-auto border-r border-border bg-card px-3 py-4',
        mobile ? 'w-60' : collapsed ? 'w-16' : 'w-60',
      )}
    >
      <Link
        href="/dashboard"
        className="px-2 text-title font-semibold text-foreground"
        aria-label="OpsDesk home"
      >
        {mobile || !collapsed ? 'OpsDesk' : 'OD'}
      </Link>
      {groups.map((group) => (
        <div key={group.title}>
          {!mobile && !collapsed ? (
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-control px-2 py-1.5 text-sm',
                      active
                        ? 'bg-card-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-card-muted hover:text-foreground',
                    )}
                  >
                    {mobile || !collapsed ? item.label : item.label.slice(0, 2)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {!mobile ? (
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="mt-auto flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed ? 'Collapse' : null}
        </button>
      ) : null}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-card focus:px-3 focus:py-2 focus:shadow-sm"
      >
        Skip to content
      </a>

      <div className="flex">
        <aside className="sticky top-0 hidden h-dvh shrink-0 lg:block">{sidebar(false)}</aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full">{sidebar(true)}</div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-border bg-card">
            <div className="flex h-14 items-center gap-3 px-4">
              <button
                type="button"
                className="rounded-control p-2 text-muted-foreground hover:bg-card-muted lg:hidden"
                aria-label="Open navigation"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="hidden min-w-0 flex-1 justify-center md:flex">
                <GlobalSearch />
              </div>
              <div className="flex-1 md:hidden" />

              <div className="relative" ref={quickRef}>
                <Button
                  size="sm"
                  aria-expanded={quickOpen}
                  aria-haspopup="menu"
                  onClick={() => setQuickOpen((value) => !value)}
                >
                  <Plus className="h-4 w-4" /> New
                </Button>
                {quickOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-52 rounded-card border border-border bg-card py-1 shadow-sm"
                  >
                    {quickActions.map((action) => (
                      <Link
                        key={action.href}
                        href={action.href}
                        role="menuitem"
                        className="block px-4 py-2 text-sm hover:bg-card-muted"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>

              <NotificationBell />

              <div className="relative" ref={userRef}>
                <button
                  type="button"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
                  onClick={() => setUserMenuOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-control px-1.5 py-1 hover:bg-card-muted"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                    {initials}
                  </span>
                  <span className="hidden text-left lg:block">
                    <span className="block text-sm font-medium leading-tight">
                      {user.firstName} {user.lastName}
                    </span>
                    <span className="block text-xs text-muted-foreground">{primaryRole}</span>
                  </span>
                </button>
                {userMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-border bg-card py-1 shadow-sm"
                  >
                    <p className="border-b border-border px-4 py-2 text-sm">
                      <span className="font-medium">
                        {user.firstName} {user.lastName}
                      </span>
                      <span className="block text-xs text-muted-foreground">{user.email}</span>
                    </p>
                    <Link
                      href="/profile"
                      role="menuitem"
                      className="block px-4 py-2 text-sm hover:bg-card-muted"
                    >
                      My profile
                    </Link>
                    <Link
                      href="/my/assets"
                      role="menuitem"
                      className="block px-4 py-2 text-sm hover:bg-card-muted"
                    >
                      My assets
                    </Link>
                    <Link
                      href="/notifications"
                      role="menuitem"
                      className="block px-4 py-2 text-sm hover:bg-card-muted"
                    >
                      Notifications
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void logout()}
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-card-muted"
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main id="content" className="mx-auto w-full max-w-6xl px-4 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
