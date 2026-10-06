'use client';

import { useRef, useState } from 'react';
import { Paperclip, Upload, X } from 'lucide-react';
import { ApiClientError } from '@/lib/api-client';
import { formatBytes } from '@/lib/format';
import { useCreateComment, useUploadAttachment } from '@/features/tickets/hooks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const MAX_BYTES = 10 * 1024 * 1024;

export function CommentComposer({
  ticketId,
  canInternal,
}: {
  ticketId: string;
  canInternal: boolean;
}) {
  const [tab, setTab] = useState<'PUBLIC' | 'INTERNAL'>('PUBLIC');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const createComment = useCreateComment(ticketId);
  const uploadAttachment = useUploadAttachment(ticketId);
  const busy = createComment.isPending || uploadAttachment.isPending;

  const pickFile = (candidate: File | undefined) => {
    setError(null);
    if (!candidate) return;
    if (candidate.size > MAX_BYTES) {
      setError(`Too large (${formatBytes(candidate.size)} / 10 MB max).`);
      return;
    }
    setFile(candidate);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!body.trim() && !file) {
      setError('Write a message or attach a file.');
      return;
    }
    try {
      if (file) {
        await uploadAttachment.mutateAsync({ file, isInternal: tab === 'INTERNAL' });
      }
      if (body.trim()) {
        await createComment.mutateAsync({ body: body.trim(), visibility: tab });
      }
      setBody('');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (mutationError) {
      setError(
        mutationError instanceof ApiClientError
          ? mutationError.message
          : 'Something went wrong. Try again.',
      );
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <div role="tablist" aria-label="Reply visibility" className="flex gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'PUBLIC'}
          onClick={() => setTab('PUBLIC')}
          className={cn(
            'rounded-control px-3 py-1.5 text-sm',
            tab === 'PUBLIC' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:bg-card-muted',
          )}
        >
          Reply
        </button>
        {canInternal ? (
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'INTERNAL'}
            onClick={() => setTab('INTERNAL')}
            className={cn(
              'rounded-control px-3 py-1.5 text-sm',
              tab === 'INTERNAL'
                ? 'bg-status-warning-bg font-medium text-status-warning-fg'
                : 'text-muted-foreground hover:bg-card-muted',
            )}
          >
            Internal note
          </button>
        ) : null}
      </div>

      {tab === 'INTERNAL' ? (
        <p className="rounded-control bg-status-warning-bg px-3 py-1.5 text-xs text-status-warning-fg">
          Only IT staff can see this.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-control bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
          {error}
        </p>
      ) : null}

      <label htmlFor="comment-body" className="sr-only">
        Message
      </label>
      <textarea
        id="comment-body"
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={tab === 'INTERNAL' ? 'Internal note (IT only)…' : 'Write a reply…'}
        className={cn(
          'w-full rounded-control border px-3 py-2 text-sm',
          tab === 'INTERNAL'
            ? 'border-status-warning-bg bg-status-warning-bg/30'
            : 'border-border bg-card',
        )}
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pickFile(event.dataTransfer.files[0]);
        }}
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-control border border-dashed px-3 py-2 text-sm',
          dragging ? 'border-primary bg-card-muted' : 'border-border',
        )}
      >
        <input
          ref={inputRef}
          id="composer-file"
          type="file"
          className="sr-only"
          onChange={(event) => pickFile(event.target.files?.[0])}
        />
        <label
          htmlFor="composer-file"
          className="inline-flex cursor-pointer items-center gap-1.5 text-primary hover:underline"
        >
          <Paperclip aria-hidden="true" className="h-4 w-4" />
          Attach a file
        </label>
        <span className="text-xs text-muted-foreground">
          Images, PDF, ZIP, text · max 10 MB · drag &amp; drop supported
        </span>
        {file ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-card-muted px-2 py-0.5 text-xs">
            {file.name} ({formatBytes(file.size)})
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          {busy ? 'Sending…' : tab === 'INTERNAL' ? 'Add internal note' : 'Send reply'}
        </Button>
      </div>
    </form>
  );
}
