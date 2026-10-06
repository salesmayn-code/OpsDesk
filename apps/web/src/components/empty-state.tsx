import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-border bg-card p-10 text-center">
      <Icon aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? (
        <Link href={action.href} className="mt-2">
          <Button variant="outline" size="sm">
            {action.label}
          </Button>
        </Link>
      ) : null}
    </div>
  );
}
