const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function part(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((p) => p.type === type)?.value);
}

export function weekdayInZone(utc: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(utc);
  return WEEKDAYS.indexOf(label);
}

export function ymdInZone(utc: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utc);
  return `${part(parts, 'year')}-${String(part(parts, 'month')).padStart(2, '0')}-${String(part(parts, 'day')).padStart(2, '0')}`;
}

export function zonedLocalToUtc(ymd: string, hm: string, timeZone: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hm.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const asLocal = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcGuess));
  const mapped = Date.UTC(
    part(asLocal, 'year'),
    part(asLocal, 'month') - 1,
    part(asLocal, 'day'),
    part(asLocal, 'hour') % 24,
    part(asLocal, 'minute'),
    part(asLocal, 'second'),
  );
  return new Date(utcGuess - (mapped - utcGuess));
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function eachYmd(fromUtc: Date, toUtc: Date, timeZone: string): string[] {
  const out: string[] = [];
  const cursor = new Date(fromUtc);
  const seen = new Set<string>();
  while (cursor.getTime() <= toUtc.getTime() + 36 * 3600_000) {
    const ymd = ymdInZone(cursor, timeZone);
    if (!seen.has(ymd)) {
      seen.add(ymd);
      out.push(ymd);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (out.length > 40) {
      break;
    }
  }
  return out;
}
