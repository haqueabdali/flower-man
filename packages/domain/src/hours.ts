/** Opening hours of a florist: per weekday "HH:MM-HH:MM" or "closed". An empty object means "no hours set" (always open). */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OpeningHours = Partial<Record<Weekday, string>>;

export const HOURS_PATTERN = /^(closed|([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d)$/;

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** JavaScript Date.getDay() (0 = Sunday) → weekday key. */
export const weekdayFromIndex = (index: number): Weekday => WEEKDAYS[(index + 6) % 7] as Weekday;

/** True when "HH:MM-HH:MM" opens before it closes. */
export function isValidRange(value: string): boolean {
  if (value === 'closed') return true;
  const [open, close] = value.split('-');
  return HOURS_PATTERN.test(value) && minutes(open ?? '') < minutes(close ?? '');
}

/**
 * Whether the florist is open at a weekday and minute of the day. Once any day is set, days left out count as closed.
 */
export function isOpenAt(hours: OpeningHours, weekday: Weekday, minuteOfDay: number): boolean {
  if (Object.keys(hours).length === 0) return true;
  const value = hours[weekday];
  if (!value || value === 'closed') return false;
  const [open, close] = value.split('-');
  return minuteOfDay >= minutes(open ?? '') && minuteOfDay < minutes(close ?? '');
}
