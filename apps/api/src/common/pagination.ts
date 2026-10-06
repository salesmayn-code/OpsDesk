import type { PageMeta } from '@opsdesk/contracts';

/** Parses `sort=-createdAt,priority` against an allow-list. Unknown fields are ignored. */
export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
): Record<string, 'asc' | 'desc'>[] | undefined {
  if (!sort) return undefined;
  const parsed: Record<string, 'asc' | 'desc'>[] = [];
  for (const field of sort.split(',')) {
    const desc = field.startsWith('-');
    const name = desc ? field.slice(1) : field;
    if (!allowed.includes(name)) continue;
    parsed.push({ [name]: desc ? 'desc' : 'asc' });
  }
  return parsed.length > 0 ? parsed : undefined;
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export function skip(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
