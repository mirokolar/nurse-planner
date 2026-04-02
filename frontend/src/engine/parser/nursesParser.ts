import type { DayAvailability, Nurse, ParseResult, TimeInterval, Weekday } from '../types';
import { WEEKDAYS } from '../types';

const DAY_MAP: Record<string, Weekday> = {
  po: 'Po', ut: 'Ut', st: 'St', ct: 'Ct', pa: 'Pa',
  'pá': 'Pa', 'čt': 'Ct', 'út': 'Ut',
};

// BUG #17 fix: zachytí undefined `end` při malformované přestávce
function parseBreaks(raw: string, lineNo: number, errors: string[]): TimeInterval[] {
  if (!raw.trim()) return [];
  const result: TimeInterval[] = [];
  for (const part of raw.split(',')) {
    const segments = part.trim().split('-');
    if (segments.length < 2 || !segments[0] || !segments[1]) {
      errors.push(`Řádek ${lineNo}: neplatný formát přestávky "${part.trim()}" — očekáváno HH:MM-HH:MM`);
      continue;
    }
    result.push({ start: segments[0].trim(), end: segments[1].trim() });
  }
  return result;
}

export function parseNurses(text: string): ParseResult<Nurse> {
  const errors: string[] = [];
  const map = new Map<string, Map<Weekday, DayAvailability>>();

  // BUG #5 fix: dvouprůchodové zpracování — ALL se zpracuje jako výchozí,
  // specifické dny ho přepíší bez ohledu na pořadí řádků v souboru.
  // Ukládáme ALL záznamy separátně, aplikujeme je jako poslední s nižší prioritou.
  interface RawLine {
    lineNo: number;
    name: string;
    isAll: boolean;
    dayRaw: string;
    parts: string[];
  }
  const rawLines: RawLine[] = [];

  const lines = text.split('\n');
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Řádek ${idx + 1}: neplatný formát — očekáváno alespoň 3 sloupce`);
      return;
    }
    const name = parts[0];
    if (!name) {
      errors.push(`Řádek ${idx + 1}: chybí jméno sestry`);
      return;
    }
    rawLines.push({ lineNo: idx + 1, name, isAll: parts[1].toLowerCase() === 'all', dayRaw: parts[1].toLowerCase(), parts });
  });

  // 1. průchod: zpracujeme ALL řádky (základ)
  // 2. průchod: specifické dny přepíší ALL (Override)
  for (const pass of [true, false]) {
    for (const { lineNo, name, isAll, dayRaw, parts } of rawLines) {
      if (isAll !== pass) continue;

      if (!map.has(name)) map.set(name, new Map());
      const nurseMap = map.get(name)!;

      const processDay = (day: Weekday) => {
        if (parts[2].toLowerCase() === 'volno') {
          nurseMap.delete(day);
          return;
        }
        if (parts.length < 4) {
          errors.push(`Řádek ${lineNo}: chybí konec směny`);
          return;
        }
        const start = parts[2];
        const end = parts[3];
        if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
          errors.push(`Řádek ${lineNo}: neplatný formát času (${start} nebo ${end})`);
          return;
        }
        const breaks = parts[4] ? parseBreaks(parts[4], lineNo, errors) : [];
        nurseMap.set(day, { day, start, end, breaks });
      };

      if (isAll) {
        WEEKDAYS.forEach(processDay);
      } else {
        const day = DAY_MAP[dayRaw];
        if (!day) {
          errors.push(`Řádek ${lineNo}: neznámý den "${parts[1]}"`);
          continue;
        }
        processDay(day);
      }
    }
  }

  const nurses: Nurse[] = Array.from(map.entries()).map(([name, dayMap]) => ({
    name,
    availability: Array.from(dayMap.values()),
  }));

  return { data: nurses, errors };
}
