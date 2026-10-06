import { describe, expect, it } from 'vitest';
import {
  PERMISSION_KEYS,
  createSlaPolicySchema,
  loginSchema,
  ticketQuerySchema,
} from './index';

const UUID = '00000000-0000-7000-8000-000000000000';

describe('contracts', () => {
  it('login rejects invalid email and accepts valid credentials', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('login rejects unknown keys (strict objects)', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: 'x', admin: true });
    expect(result.success).toBe(false);
  });

  it('ticket query parses CSV filters and applies pagination defaults', () => {
    const parsed = ticketQuerySchema.parse({ status: 'NEW,TRIAGED' });
    expect(parsed.status).toEqual(['NEW', 'TRIAGED']);
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('ticket query rejects unknown status values', () => {
    expect(ticketQuerySchema.safeParse({ status: 'NEW,FLYING' }).success).toBe(false);
  });

  it('sla policy defaults match the spec (75/90, pause on WAITING_FOR_USER)', () => {
    const parsed = createSlaPolicySchema.parse({
      name: 'X',
      calendarId: UUID,
      firstResponseMinutes: 15,
      resolutionMinutes: 60,
    });
    expect(parsed.warningPercent).toBe(75);
    expect(parsed.escalationPercent).toBe(90);
    expect(parsed.pauseOnStatuses).toEqual(['WAITING_FOR_USER']);
  });

  it('permission catalogue contains no duplicates', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });
});
