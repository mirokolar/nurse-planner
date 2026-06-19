import * as XLSX from 'xlsx';
import type { DayAvailability, Nurse, ParseResult, Patient, VisitRequirement, Weekday } from '../types';
import { WEEKDAYS } from '../types';

const SHIFT_START = '07:00';
const SHIFT_END   = '15:30';

// ── Pomocné funkce pro čas ────────────────────────────────────

/** Zlomek dne (0–1 jak ho vrátí SheetJS) → "HH:MM" */
function fractionToTime(frac: number): string {
  const totalMin = Math.round(frac * 24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalizuje časový string "H:MM" nebo "HH:MM" → "HH:MM"; null pokud nelze. */
function normalizeTime(raw: string): string | null {
  const s = raw.trim().replace(/\./g, ':'); // "8.00" → "8:00"
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Parsuje buňku s časem. Vrátí { start, end, isSingle } nebo null.
 *
 * Podporované formáty:
 *   0.3125              → 7:30 (SheetJS fraction of day) — jednoduché okno od
 *   "7:30-9:00"         → rozsah
 *   "8.00-14:30"        → tečka místo dvojtečky
 *   "14:00 - 14:30"     → mezery kolem pomlčky
 *   "7:30"              → jeden čas (windowStart, windowEnd = ANY)
 *
 * Pro jednoduché časy (isSingle=true) je end === start, ale volající by měl
 * použít windowEnd = 'ANY' (tj. „přijďte od tohoto času kdykoli").
 */
function parseTimeCell(raw: unknown): { start: string; end: string; isSingle: boolean } | null {
  if (raw == null) return null;

  // Číslo = SheetJS fraction of day (0 < x < 1)
  if (typeof raw === 'number') {
    if (raw <= 0 || raw >= 1) return null;
    const t = fractionToTime(raw);
    return { start: t, end: t, isSingle: true };
  }

  // String
  const s = String(raw)
    .trim()
    .replace(/\./g, ':')   // tečka → dvojtečka
    .replace(/\s/g, '');   // odstraníme mezery

  // Hledáme pomlčku ODDĚLUJÍCÍ dva časy (ne pomlčku v "H:MM")
  // Struktura: HH:MM-HH:MM → pomlčka je na pozici > 3
  const firstColon = s.indexOf(':');
  if (firstColon === -1) return null;

  const hyphen = s.indexOf('-', firstColon + 1); // pomlčka za první ':MM'

  if (hyphen === -1) {
    // Pouze jeden čas
    const t = normalizeTime(s);
    if (!t) return null;
    return { start: t, end: t, isSingle: true };
  }

  const start = normalizeTime(s.slice(0, hyphen));
  const end   = normalizeTime(s.slice(hyphen + 1));
  if (!start || !end) return null;
  return { start, end, isSingle: false };
}

/**
 * Parsuje buňku přestávky ve formátu "HH:MM-HH:MM" nebo jako dvě samostatné buňky (start, end).
 * Přestávky z Excelu jsou PŘEKÁŽKY v práci (dovolená, lékař, …), ne periodické pauzy —
 * blokují slot, ale nenahrazují povinnou 30min přestávku na odpočinek (tu vkládá scheduler).
 */
function parseBreakCells(rawStart: unknown, rawEnd: unknown) {
  const s = rawStart != null ? normalizeTime(String(rawStart).trim().replace(/\./g, ':')) : null;
  const e = rawEnd   != null ? normalizeTime(String(rawEnd).trim().replace(/\./g, ':'))   : null;
  if (!s || !e) return null;
  return { start: s, end: e };
}

// ── Parser klientů (list "klienti") ──────────────────────────

function parseKlienti(ws: XLSX.WorkSheet): ParseResult<Patient> {
  const errors: string[] = [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  // Řádky 0 a 1 jsou hlavičky — data začínají od řádku 2 (index 2)
  const patientMap = new Map<string, Patient>();

  for (let ri = 2; ri < rows.length; ri++) {
    const row = rows[ri] as unknown[];
    if (!row || row.every((c) => c == null || c === false)) continue;

    const plan = row[0];
    if (plan !== true && plan !== 1) continue; // nezatržení klienti

    const rawName    = row[1];
    const rawAddress = row[2];
    const name    = rawName    != null ? String(rawName).trim()    : '';
    const address = rawAddress != null ? String(rawAddress).trim() : '';

    if (!name) { errors.push(`Řádek ${ri + 1}: chybí jméno klienta`); continue; }

    // ID = normalizované jméno (stejný klient na více řádcích = 2× denně)
    const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-záčďéěíňóřšťúůýž_]/gi, '');

    if (!patientMap.has(id)) {
      patientMap.set(id, { id, name, address, visits: [] });
    }
    const patient = patientMap.get(id)!;

    // Každý den: sloupce 5, 9, 13, 17, 21 (base-1 indexy: 4,8,12,16,20 base-0)
    for (let di = 0; di < 5; di++) {
      const baseCol    = 4 + di * 4;   // base-0
      const dayCheck   = row[baseCol];
      const casRaw     = row[baseCol + 1];
      const nahRaw     = row[baseCol + 2];
      const durationRaw = row[baseCol + 3];

      if (dayCheck !== true && dayCheck !== 1) continue;

      const day: Weekday = WEEKDAYS[di];
      const durationMin = durationRaw != null ? Math.round(Number(durationRaw)) : 0;
      if (!durationMin || durationMin <= 0) {
        errors.push(`${name} — ${day}: chybí nebo neplatná délka úkonu`);
        continue;
      }

      const idealRange  = parseTimeCell(casRaw);
      const backupRange = parseTimeCell(nahRaw);

      const req: VisitRequirement = {
        patientId: id,
        day,
        // Jednoduché časy (bez rozsahu) = "přijďte od tohoto času" → windowEnd = ANY
        windowStart: idealRange  ? idealRange.start  : 'ANY',
        windowEnd:   idealRange  && !idealRange.isSingle  ? idealRange.end  : 'ANY',
        backupWindowStart: backupRange ? backupRange.start                        : undefined,
        backupWindowEnd:   backupRange && !backupRange.isSingle ? backupRange.end : undefined,
        durationMin,
      };
      patient.visits.push(req);
    }
  }

  if (patientMap.size === 0) {
    errors.push('Žádný klient se zatrhnutým plánováním nebyl nalezen.');
  }

  return { data: Array.from(patientMap.values()), errors };
}

// ── Parser pečovatelek (listy "docházka" + "pečovatelky") ────

function parsePecovatelky(
  dochazkaWs: XLSX.WorkSheet,
  pecovatelkyWs: XLSX.WorkSheet,
): ParseResult<Nurse> {
  const errors: string[] = [];

  // --- List "pečovatelky": adresa pro routing start ---
  const pecRows = XLSX.utils.sheet_to_json<unknown[]>(pecovatelkyWs, {
    header: 1, defval: null,
  }) as unknown[][];

  const homeAddressMap = new Map<string, string>();
  for (let ri = 1; ri < pecRows.length; ri++) {
    const row = pecRows[ri];
    if (!row || row[0] == null) continue;
    const name    = String(row[0]).trim();
    const address = row[1] != null ? String(row[1]).trim() : '';
    if (name) homeAddressMap.set(name, address);
  }

  // --- List "docházka": přítomnost + přestávky ---
  // Řádek 0: sekce, Řádek 1: sub-hlavičky, Řádek 2+: data
  const dochRows = XLSX.utils.sheet_to_json<unknown[]>(dochazkaWs, {
    header: 1, defval: null,
  }) as unknown[][];

  const nurses: (Nurse & { _homeAddress?: string })[] = [];

  for (let ri = 2; ri < dochRows.length; ri++) {
    const row = dochRows[ri] as unknown[];
    if (!row || row[0] == null) continue;

    const name = String(row[0]).trim();
    if (!name) continue;

    const availability: DayAvailability[] = [];

    for (let di = 0; di < 5; di++) {
      const presenceCol   = 1 + di;       // cols 1–5
      const breakStartCol = 6 + di * 2;   // cols 6,8,10,12,14
      const breakEndCol   = 7 + di * 2;   // cols 7,9,11,13,15

      const present = row[presenceCol];
      if (present !== true && present !== 1) continue;

      const day: Weekday = WEEKDAYS[di];
      // Přestávka z Excelu = překážka v práci (dovolená, lékař, …) → blokuje slot.
      // Povinnou 30min přestávku na odpočinek vkládá scheduler navíc (re-timing).
      const brk = parseBreakCells(row[breakStartCol], row[breakEndCol]);
      availability.push({
        day,
        start: SHIFT_START,
        end:   SHIFT_END,
        breaks: brk ? [brk] : [],
      });
    }

    if (availability.length === 0) continue;

    const homeAddress = homeAddressMap.get(name) ?? '';
    nurses.push({
      name,
      availability,
      ...(homeAddress ? { _homeAddress: homeAddress } : {}),
    } as Nurse & { _homeAddress?: string });
  }

  if (nurses.length === 0) {
    errors.push('Žádná pečovatelka nemá vyplněnou přítomnost v listu "docházka".');
  }

  return { data: nurses as Nurse[], errors };
}

// ── Hlavní export ─────────────────────────────────────────────

export interface ExcelParseResult {
  patients: ParseResult<Patient>;
  nurses: ParseResult<Nurse & { _homeAddress?: string }>;
}

export function parseExcel(buffer: ArrayBuffer): ExcelParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });

  const klientiWs     = wb.Sheets['klienti'];
  const dochazkaWs    = wb.Sheets['docházka'];
  const pecovatelkyWs = wb.Sheets['pečovatelky'];

  const missing: string[] = [];
  if (!klientiWs)     missing.push('"klienti"');
  if (!dochazkaWs)    missing.push('"docházka"');
  if (!pecovatelkyWs) missing.push('"pečovatelky"');

  if (missing.length > 0) {
    const err = [`Soubor neobsahuje listy: ${missing.join(', ')}`];
    return {
      patients: { data: [], errors: err },
      nurses:   { data: [], errors: err },
    };
  }

  return {
    patients: parseKlienti(klientiWs),
    nurses:   parsePecovatelky(dochazkaWs, pecovatelkyWs),
  };
}
