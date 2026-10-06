'use client';

import { Lock, Paperclip } from 'lucide-react';
import { API_URL } from '@/lib/api-client';
import { formatBytes, formatDateTime, relativeTime } from '@/lib/format';
import { attachmentDownloadUrl, type HistoryEventDto } from '@/features/tickets/api';
import { useTicketActivity } from '@/features/tickets/hooks';

function describeEvent(event: HistoryEventDto): string {
  switch (event.type) {
    case 'CREATED':
      return 'created the ticket';
    case 'STATUS_CHANGED':
      return `changed status ${event.fromValue ?? ''} → ${event.toValue ?? ''}`;
    case 'ASSIGNED':
      return 'assigned the ticket';
    case 'REASSIGNED':
      return 'reassigned the ticket';
    case 'UNASSIGNED':
      return 'unassigned the ticket';
    case 'PRIORITY_CHANGED':
      return `changed priority ${event.fromValue ?? ''} → ${event.toValue ?? ''}`;
    case 'SLA_APPLIED':
      return 'SLA timers started';
    case 'SLA_BREACHED':
      return 'SLA breached';
    case 'COMMENT_ADDED':
      return 'replied';
    case 'INTERNAL_NOTE_ADDED':
      return 'added an internal note';
    case 'ATTACHMENT_ADDED':
      return 'attached a file';
    case 'ATTACHMENT_REMOVED':
      return 'removed an attachment';
    case 'RESOLVED':
      return 'resolved the ticket';
    case 'REOPENED':
      return 'reopened the ticket';
    case 'CLOSED':
      return 'closed the ticket';
    case 'CANCELLED':
      return 'cancelled the ticket';
    case 'UPDATED':
      return 'updated the ticket';
    case 'ASSET_LINKED':
      return 'linked an asset';
    default:
      return event.type.toLowerCase().replaceAll('_', ' ');
  }
}

interface Entry {
  id: string;
  at: string;
  internal: boolean;
  node: React.ReactNode;
}

export function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const { comments, history, attachments } = useTicketActivity(ticketId);

  if (comments.isLoading || history.isLoading || attachments.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading activity…</p>;
  }

  const entries: Entry[] = [];

  for (const event of history.data?.data ?? []) {
    entries.push({
      id: `event-${event.id}`,
      at: event.createdAt,
      internal: event.isInternal,
      node: (
        <p className="text-sm">
          <span className="font-medium">
            {event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : 'System'}
          </span>{' '}
          <span className="text-muted-foreground">{describeEvent(event)}</span>
        </p>
      ),
    });
  }

  for (const comment of comments.data?.data ?? []) {
    entries.push({
      id: `comment-${comment.id}`,
      at: comment.createdAt,
      internal: comment.visibility === 'INTERNAL',
      node: (
        <div>
          <p className="text-sm font-medium">
            {comment.author.firstName} {comment.author.lastName}
            {comment.visibility === 'INTERNAL' ? (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-status-warning-fg">
                <Lock aria-hidden="true" className="h-3 w-3" /> Internal note
              </span>
            ) : null}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
          {comment.editedAt ? (
            <p className="mt-1 text-xs text-muted-foreground">edited {relativeTime(comment.editedAt)}</p>
          ) : null}
        </div>
      ),
    });
  }

  for (const attachment of attachments.data?.data ?? []) {
    entries.push({
      id: `attachment-${attachment.id}`,
      at: attachment.createdAt,
      internal: attachment.isInternal,
      node: (
        <p className="flex items-center gap-2 text-sm">
          <Paperclip aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          <a
            href={`${API_URL}${attachmentDownloadUrl(attachment.id)}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {attachment.originalName}
          </a>
          <span className="text-xs text-muted-foreground">{formatBytes(attachment.sizeBytes)}</span>
          {attachment.isInternal ? (
            <span className="text-xs text-status-warning-fg">internal</span>
          ) : null}
        </p>
      ),
    });
  }

  entries.sort((a, b) => a.at.localeCompare(b.at));

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ul className="space-y-4">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={
            entry.internal
              ? 'border-l-2 border-status-warning-fg bg-status-warning-bg/40 py-2 pl-3'
              : 'border-l-2 border-border py-2 pl-3'
          }
        >
          {entry.node}
          <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(entry.at)}>
            {relativeTime(entry.at)}
          </p>
        </li>
      ))}
    </ul>
  );
}
