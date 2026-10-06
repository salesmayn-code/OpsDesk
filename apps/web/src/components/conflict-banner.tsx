import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown on 409 CONFLICT_STALE_VERSION; reload refetches without losing the page. */
export function ConflictBanner({
  message,
  onReload,
}: {
  message?: string;
  onReload: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-status-warning-bg bg-status-warning-bg px-4 py-3 text-sm text-status-warning-fg"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle aria-hidden="true" className="h-4 w-4" />
        {message ?? 'This record was changed by someone else. Reload to see the latest version.'}
      </span>
      <Button variant="outline" size="sm" onClick={onReload}>
        Reload
      </Button>
    </div>
  );
}
