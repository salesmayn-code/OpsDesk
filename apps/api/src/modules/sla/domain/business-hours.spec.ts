import { addBusinessMinutes, businessMinutesBetween, type BusinessCalendarConfig } from './business-hours';

const PK: BusinessCalendarConfig = {
  timezone: 'Asia/Karachi',
  is24x7: false,
  schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '18:00' })),
  holidays: [],
};

const NY: BusinessCalendarConfig = {
  timezone: 'America/New_York',
  is24x7: false,
  schedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
  holidays: [],
};

const ALWAYS: BusinessCalendarConfig = { ...PK, is24x7: true, schedule: [] };

// 2026-10-05 is a Monday.
describe('addBusinessMinutes', () => {
  it('adds minutes within the working day', () => {
    // Mon 10:00 PKT + 120m = Mon 12:00 PKT (07:00Z + 2h)
    const start = new Date('2026-10-05T05:00:00Z');
    expect(addBusinessMinutes(start, 120, PK).toISOString()).toBe('2026-10-05T07:00:00.000Z');
  });

  it('shifts to the next day when the window ends', () => {
    // Mon 17:30 PKT + 60m -> Tue 09:30 PKT
    const start = new Date('2026-10-05T12:30:00Z');
    expect(addBusinessMinutes(start, 60, PK).toISOString()).toBe('2026-10-06T04:30:00.000Z');
  });

  it('starts before opening moves to opening time', () => {
    // Mon 06:00 PKT + 60m -> Mon 10:00 PKT
    const start = new Date('2026-10-05T01:00:00Z');
    expect(addBusinessMinutes(start, 60, PK).toISOString()).toBe('2026-10-05T05:00:00.000Z');
  });

  it('skips weekends', () => {
    // Fri 17:00 PKT + 120m -> Mon 10:00 PKT (Fri 18:00 close + 1h wait + 1h)
    const friday = new Date('2026-10-09T12:00:00Z');
    expect(addBusinessMinutes(friday, 120, PK).toISOString()).toBe('2026-10-12T05:00:00.000Z');
  });

  it('skips holidays entirely', () => {
    const withHoliday: BusinessCalendarConfig = {
      ...PK,
      holidays: ['2026-10-06'], // Tuesday
    };
    // Mon 17:00 + 120m: Mon gets 60m, Tue is holiday, Wed gets 60m -> Wed 10:00
    const start = new Date('2026-10-05T12:00:00Z');
    expect(addBusinessMinutes(start, 120, withHoliday).toISOString()).toBe(
      '2026-10-07T05:00:00.000Z',
    );
  });

  it('is exact for 24x7 calendars', () => {
    const start = new Date('2026-10-10T22:30:00Z'); // Saturday night
    expect(addBusinessMinutes(start, 90, ALWAYS).toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });

  it('handles the DST spring-forward gap (America/New_York, 2026-03-08)', () => {
    // Fri 2026-03-06 16:30 EST + 60m: 30m on Friday (to 17:00), weekend skipped,
    // 30m on Monday 09:00-09:30 EDT (= 13:30Z; the offset changed over the gap).
    const friday = new Date('2026-03-06T21:30:00Z');
    expect(addBusinessMinutes(friday, 60, NY).toISOString()).toBe('2026-03-09T13:30:00.000Z');
  });

  it('handles the DST fall-back day (America/New_York, 2026-11-01)', () => {
    // Friday 2026-10-30 16:00 EDT + 120m: 60m Friday + next Monday 60m -> Mon 10:00 EST
    const friday = new Date('2026-10-30T20:00:00Z');
    expect(addBusinessMinutes(friday, 120, NY).toISOString()).toBe('2026-11-02T15:00:00.000Z');
  });

  it('returns the start instant for non-positive minutes', () => {
    const start = new Date('2026-10-05T05:00:00Z');
    expect(addBusinessMinutes(start, 0, PK).toISOString()).toBe(start.toISOString());
    expect(addBusinessMinutes(start, -30, PK).toISOString()).toBe(start.toISOString());
  });
});

describe('businessMinutesBetween', () => {
  it('counts partial business time within a day', () => {
    const from = new Date('2026-10-05T05:00:00Z'); // Mon 10:00
    const to = new Date('2026-10-05T07:30:00Z'); // Mon 12:30
    expect(businessMinutesBetween(from, to, PK)).toBe(150);
  });

  it('excludes non-working hours', () => {
    const from = new Date('2026-10-05T13:00:00Z'); // Mon 18:00 (closed)
    const to = new Date('2026-10-06T03:00:00Z'); // Tue 08:00 (before open)
    expect(businessMinutesBetween(from, to, PK)).toBe(0);
  });

  it('counts across a weekend boundary', () => {
    const from = new Date('2026-10-09T13:00:00Z'); // Fri 18:00
    const to = new Date('2026-10-12T05:00:00Z'); // Mon 10:00
    expect(businessMinutesBetween(from, to, PK)).toBe(60);
  });

  it('excludes holidays', () => {
    const withHoliday: BusinessCalendarConfig = { ...PK, holidays: ['2026-10-06'] };
    const from = new Date('2026-10-05T05:00:00Z'); // Mon 10:00
    const to = new Date('2026-10-07T05:00:00Z'); // Wed 10:00
    // Mon 8h (10-18) + Tue holiday (0) + Wed 1h
    expect(businessMinutesBetween(from, to, withHoliday)).toBe(9 * 60);
  });

  it('is pure wall-clock minutes for 24x7 calendars', () => {
    const from = new Date('2026-10-05T05:00:00Z');
    const to = new Date('2026-10-05T07:30:00Z');
    expect(businessMinutesBetween(from, to, ALWAYS)).toBe(150);
  });

  it('returns 0 for inverted ranges', () => {
    const a = new Date('2026-10-05T07:00:00Z');
    const b = new Date('2026-10-05T05:00:00Z');
    expect(businessMinutesBetween(a, b, PK)).toBe(0);
  });
});
