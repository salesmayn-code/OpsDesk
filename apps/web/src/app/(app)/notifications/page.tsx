'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BellOff } from 'lucide-react';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/features/platform/hooks';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/toast';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const query = new URLSearchParams({ limit: '25' });
  if (unreadOnly) query.set('unread', 'true');
  if (cursor) query.set('cursor', cursor);

  const notifications = useNotifications(query.toString());
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display font-semibold tracking-tight">Notifications</h1>
        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setCursor(undefined);
              setUnreadOnly((value) => !value);
            }}
          >
            {unreadOnly ? 'Showing unread' : 'Unread only'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAll.mutate(undefined, { onSuccess: () => toast('All notifications marked as read') })}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {notifications.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : (notifications.data?.data ?? []).length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="You're all caught up"
          description="Notifications about assignments, replies, and SLA events will appear here."
          action={{ href: '/tickets', label: 'Browse tickets' }}
        />
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-card">
          {notifications.data!.data.map((notification) => (
            <li key={notification.id} className={cn(!notification.readAt && 'bg-status-info-bg/40')}>
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={notification.link ?? '#'}
                    onClick={() => markRead.mutate(notification.id)}
                    className="text-sm font-medium hover:underline"
                  >
                    {notification.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">{notification.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {relativeTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.readAt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markRead.mutate(notification.id)}
                  >
                    Mark read
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {notifications.data?.meta.nextCursor ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor(notifications.data!.meta.nextCursor!)}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
