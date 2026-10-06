import { Duration, Instant, LocalDate, LocalTime, ZoneId, ZonedDateTime } from '@js-joda/core';
import '@js-joda/timezone';

/**
 * Pure business-hours calculator (TRD §7.2). DST-safe via js-joda timezone rules.
 * Weekday: 1 = Monday … 7 = Sunday (ISO). Times are "HH:mm" wall-clock in the calendar zone.
 */
export interface ScheduleWindow {
  weekday: number;
  start: string;
  end: string;
}

export interface BusinessCalendarConfig {
  timezone: string;
  is24x7: boolean;
  schedule: ScheduleWindow[];
  /** ISO dates (YYYY-MM-DD) in the calendar timezone. */
  holidays: string[];
}

const MAX_DAYS = 3660;

interface ResolvedWindow {
  start: ZonedDateTime;
  end: ZonedDateTime;
}

function parseTime(value: string): LocalTime {
  const [hours, minutes] = value.split(':').map(Number);
  return LocalTime.of(hours ?? 0, minutes ?? 0);
}

function windowsFor(
  date: LocalDate,
  calendar: BusinessCalendarConfig,
  zone: ZoneId,
): ResolvedWindow[] {
  const weekday = date.dayOfWeek().value();
  return calendar.schedule
    .filter((window) => window.weekday === weekday)
    .map((window) => ({
      start: ZonedDateTime.of(date, parseTime(window.start), zone),
      end: ZonedDateTime.of(date, parseTime(window.end), zone),
    }))
    .filter((window) => window.end.isAfter(window.start))
    .sort((a, b) => a.start.compareTo(b.start));
}

function instant(zoned: ZonedDateTime): Date {
  return new Date(zoned.toInstant().toEpochMilli());
}

function findNextWindowStart(
  fromDate: LocalDate,
  calendar: BusinessCalendarConfig,
  zone: ZoneId,
  holidays: Set<string>,
): ZonedDateTime {
  for (let offset = 1; offset <= MAX_DAYS; offset++) {
    const date = fromDate.plusDays(offset);
    if (holidays.has(date.toString())) continue;
    const windows = windowsFor(date, calendar, zone);
    if (windows.length > 0) return windows[0]!.start;
  }
  throw new Error('No working window found within the supported range.');
}

/** Adds business minutes, skipping closed days/hours and holidays. */
export function addBusinessMinutes(
  start: Date,
  minutes: number,
  calendar: BusinessCalendarConfig,
): Date {
  if (minutes <= 0) return new Date(start.getTime());
  if (calendar.is24x7) return new Date(start.getTime() + minutes * 60_000);

  const zone = ZoneId.of(calendar.timezone);
  const holidays = new Set(calendar.holidays);
  let cursor = ZonedDateTime.ofInstant(Instant.ofEpochMilli(start.getTime()), zone);
  let remaining = minutes;

  for (let guard = 0; guard < MAX_DAYS; guard++) {
    const date = cursor.toLocalDate();
    if (holidays.has(date.toString())) {
      cursor = findNextWindowStart(date, calendar, zone, holidays);
      continue;
    }
    const windows = windowsFor(date, calendar, zone);
    if (windows.length === 0) {
      cursor = findNextWindowStart(date, calendar, zone, holidays);
      continue;
    }

    for (const window of windows) {
      if (!window.end.isAfter(cursor)) continue;
      if (cursor.isBefore(window.start)) cursor = window.start;

      const available = Duration.between(cursor, window.end).toMinutes();
      if (remaining <= available) {
        return instant(cursor.plusMinutes(remaining));
      }
      remaining -= available;
      cursor = window.end;
    }

    cursor = findNextWindowStart(date, calendar, zone, holidays);
  }
  throw new Error('addBusinessMinutes exceeded the supported range.');
}

/** Counts business minutes between two instants, excluding paused/closed periods. */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  calendar: BusinessCalendarConfig,
): number {
  if (to.getTime() <= from.getTime()) return 0;
  if (calendar.is24x7) {
    return Math.floor((to.getTime() - from.getTime()) / 60_000);
  }

  const zone = ZoneId.of(calendar.timezone);
  const holidays = new Set(calendar.holidays);
  const fromInstant = Instant.ofEpochMilli(from.getTime());
  const toInstant = Instant.ofEpochMilli(to.getTime());
  let date = LocalDate.from(ZonedDateTime.ofInstant(fromInstant, zone));
  const lastDate = LocalDate.from(ZonedDateTime.ofInstant(toInstant, zone));
  let total = 0;

  for (let guard = 0; guard < MAX_DAYS && !date.isAfter(lastDate); guard++) {
    if (!holidays.has(date.toString())) {
      for (const window of windowsFor(date, calendar, zone)) {
        const start =
          window.start.toInstant().compareTo(fromInstant) > 0
            ? window.start.toInstant()
            : fromInstant;
        const end =
          window.end.toInstant().compareTo(toInstant) < 0 ? window.end.toInstant() : toInstant;
        if (end.compareTo(start) > 0) {
          total += Math.floor(Duration.between(start, end).toMinutes());
        }
      }
    }
    date = date.plusDays(1);
  }
  return total;
}

/** Percentage of a business-minute target consumed, excluding paused minutes. */
export function businessPercentConsumed(
  startedAt: Date,
  now: Date,
  targetMinutes: number,
  pausedMinutes: number,
  calendar: BusinessCalendarConfig,
): number {
  if (targetMinutes <= 0) return 100;
  const elapsed = businessMinutesBetween(startedAt, now, calendar) - pausedMinutes;
  return Math.max(0, Math.round((elapsed / targetMinutes) * 100));
}
