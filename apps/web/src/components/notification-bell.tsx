'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import {
  useMarkAllNotificationsRead,
  useNotifications,
  useUnreadCount,
} from '@/features/platform/hooks';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadCount();
  const notifications = useNotifications('limit=5');
  const markAll = useMarkAllNotificationsRead();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const count = unread.data?.data.count ?? 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={`Notifications${count > 0 ? `, ${count} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-control p-2 text-muted-foreground hover:bg-card-muted hover:text-foreground"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger-fg px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-96 rounded-card border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <p className="text-sm font-medium">Notifications</p>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => markAll.mutate()}
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(notifications.data?.data ?? []).map((notification) => (
              <li key={notification.id} className="border-b border-border last:border-0">
                <Link
                  href={notification.link ?? '/notifications'}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'block px-4 py-3 text-sm hover:bg-card-muted',
                    !notification.readAt && 'bg-status-info-bg/40',
                  )}
                >
                  <p className="font-medium">{notification.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{notification.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {relativeTime(notification.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
            {(notifications.data?.data ?? []).length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notifications yet.
              </li>
            ) : null}
          </ul>
          <div className="border-t border-border px-4 py-2 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
