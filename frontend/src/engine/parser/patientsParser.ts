import type { ParseResult, Patient, VisitRequirement, Weekday } from '../types';
import { WEEKDAYS } from '../types';
import { toMinutes } from '../../utils/timeUtils';

const DAY_MAP: Record<string, Weekday> = {
  po: 'Po', ut: 'Ut', st: 'St', ct: 'Ct', pa: 'Pa',
  'pá': 'Pa', 'čt': 'Ct', 'út': 'Ut',
};

export function parsePatients(text: string): ParseResult<Patient> {
  const errors: string[] = [];
  const patientMap = new Map<string, Patient>();

  const lines = text.split('\n');
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;

    // BUG #7 fix: adresa může obsahovat '|' — fixní počet sloupců zleva/zprava.
    // Formát: ID | JMENO | ADRESA | DNY | CAS_OD | CAS_DO | TRVANI | PREF
    // Posledních 5 sloupců je fixních, sloupce 0 a 1 taky — adresa je vše mezi.
    const allParts = line.split('|').map((p) => p.trim());
    if (allParts.length < 8) {
      errors.push(`Řádek ${idx + 1}: neplatný formát — očekáváno 8 sloupců, nalezeno ${allParts.length}`);
      return;
    }
    const id      = allParts[0];
    const name    = allParts[1];
    const address = allParts.slice(2, allParts.length - 5).join(' | ').trim() || allParts[2];
    const [daysRaw, casOd, casDo, trvaniRaw, prefSestra] = allParts.slice(allParts.length - 5);

    if (!id || !name || !address) {
      errors.push(`Řádek ${idx + 1}: chybí ID, jméno nebo adresa`);
      return;
    }

    const durationMin = parseInt(trvaniRaw, 10);
    if (isNaN(durationMin) || durationMin <= 0) {
      errors.push(`Řádek ${idx + 1}: neplatná délka návštěvy "${trvaniRaw}"`);
      return;
    }

    const windowStart = casOd.toUpperCase() === 'ANY' ? 'ANY' : casOd;
    const windowEnd   = casDo.toUpperCase() === 'ANY' ? 'ANY' : casDo;
    const preferredNurse = prefSestra.toUpperCase() === 'ANY' ? 'ANY' : prefSestra;

    if (windowStart !== 'ANY' && !/^\d{2}:\d{2}$/.test(windowStart)) {
      errors.push(`Řádek ${idx + 1}: neplatný formát CAS_OD "${casOd}"`);
      return;
    }
    if (windowEnd !== 'ANY' && !/^\d{2}:\d{2}$/.test(windowEnd)) {
      errors.push(`Řádek ${idx + 1}: neplatný formát CAS_DO "${casDo}"`);
      return;
    }

    // BUG #3 fix: validace CAS_OD <= CAS_DO
    if (windowStart !== 'ANY' && windowEnd !== 'ANY') {
      if (toMinutes(windowStart) > toMinutes(windowEnd)) {
        errors.push(`Řádek ${idx + 1}: CAS_OD (${windowStart}) je pozdější než CAS_DO (${windowEnd})`);
        return;
      }
    }

    const days: Weekday[] = daysRaw.toLowerCase() === 'all'
      ? [...WEEKDAYS]
      : daysRaw.split(',').map((d) => {
          const day = DAY_MAP[d.trim().toLowerCase()];
          if (!day) errors.push(`Řádek ${idx + 1}: neznámý den "${d.trim()}"`);
          return day;
        }).filter(Boolean) as Weekday[];

    if (!patientMap.has(id)) {
      patientMap.set(id, { id, name, address, visits: [] });
    }
    const patient = patientMap.get(id)!;

    days.forEach((day) => {
      const req: VisitRequirement = { patientId: id, day, windowStart, windowEnd, durationMin, preferredNurse };
      patient.visits.push(req);
    });
  });

  return { data: Array.from(patientMap.values()), errors };
}
