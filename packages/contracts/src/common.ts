import { z } from 'zod';

/** UUIDv7 id or human key (TKT-004821, LAP-00421) accepted in path params. */
export const idOrKeySchema = z.string().min(1).max(40);

export const uuidSchema = z.uuid();

/** ISO-8601 UTC datetime string. */
export const isoDateTimeSchema = z.iso.datetime();

/** Query param accepting `true`/`false` strings. */
export const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

/** Query param accepting a comma-separated list of enum values. */
export function csvEnum<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
    z.array(z.enum(values)),
  );
}

export const emptyObjectSchema = z.strictObject({});
