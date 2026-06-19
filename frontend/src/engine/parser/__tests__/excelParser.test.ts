/**
 * Testy pro excelParser — zejména parsování různých formátů časů z reálných dat.
 *
 * Reálná data obsahují tyto formáty:
 *   - SheetJS fraction-of-day (číslo 0–1, např. 0.3125 = 07:30)
 *   - Řetězcový rozsah '7:30-9:00'
 *   - Řetězcový rozsah s tečkou '8.00-14:30'
 *   - Rozsah s mezerami '14:00 - 14:30', '7:30 - 8:30'
 *   - Jeden čas '13:00' → windowEnd = ANY
 */

import { describe, it, expect } from 'vitest';

// Testujeme interní funkce přes jejich chování v parseKlienti/parsePecovatelky.
// Protože jsou privátní, testujeme přes veřejnou funkci parseExcel s mockovanými daty.
// Pro jednotkové testy vytvoříme XLSX buffer programaticky pomocí 'xlsx'.
import * as XLSX from 'xlsx';
import { parseExcel } from '../excelParser';
import type { VisitRequirement } from '../../types';

// ── Pomocná funkce: sestaví ArrayBuffer simulující xlsx soubor ───────────────

function buildWorkbook(
  klientiData: unknown[][],
  dochazkaData: unknown[][],
  pecovatelkyData: unknown[][],
): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const klientiWs = XLSX.utils.aoa_to_sheet(klientiData);
  XLSX.utils.book_append_sheet(wb, klientiWs, 'klienti');

  const dochWs = XLSX.utils.aoa_to_sheet(dochazkaData);
  XLSX.utils.book_append_sheet(wb, dochWs, 'docházka');

  const pecWs = XLSX.utils.aoa_to_sheet(pecovatelkyData);
  XLSX.utils.book_append_sheet(wb, pecWs, 'pečovatelky');

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buf as ArrayBuffer;
}

/** Minimální hlavičky pro list klienti (řádky 0 a 1) */
const KLIENTI_HEADER: unknown[][] = [
  ['plán', 'jméno', 'adresa', 'telefon',
   'pondělí', null, null, null,
   'úterý',  null, null, null,
   'středa',  null, null, null,
   'čtvrtek', null, null, null,
   'pátek',   null, null, null],
  [null, null, null, null,
   null, 'čas', 'náhradní čas', 'délka úkonu',
   null, 'čas', 'náhradní čas', 'délka úkonu',
   null, 'čas', 'náhradní čas', 'délka úkonu',
   null, 'čas', 'náhradní čas', 'délka úkonu',
   null, 'čas', 'náhradní čas', 'délka úkonu'],
];

/** Minimální hlavičky pro list docházka */
const DOCH_HEADER: unknown[][] = [
  [null, 'přítomnost', null, null, null, null, 'přestávky', null, null, null, null, null, null, null, null, null],
  ['jméno', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek',
   'pondělí', null, 'úterý', null, 'středa', null, 'čtvrtek', null, 'pátek', null],
];

/** Hlavičky pro list pečovatelky */
const PEC_HEADER: unknown[][] = [
  ['jméno', 'adresa', 'telefon'],
];

// ── Pomocný builder ──────────────────────────────────────────────────────────

function makeNurseRow(name: string, days = [true, true, true, true, true]): unknown[] {
  return [name, ...days, null, null, null, null, null, null, null, null, null, null];
}

function makeNurseAddr(name: string, addr: string): unknown[] {
  return [name, addr, null];
}

// ── Testy pro parsování časových formátů ────────────────────────────────────

describe('excelParser — formáty časů v buňkách', () => {
  function parseOneClient(timeCell: unknown, backupCell: unknown = null): VisitRequirement {
    const buf = buildWorkbook(
      [
        ...KLIENTI_HEADER,
        [true, 'Testovací Klient', 'Ulice 1, Brno', null,
          true, timeCell, backupCell, 60,   // Po
          false, null, null, null,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null],
      ],
      [...DOCH_HEADER, makeNurseRow('Sestra Jana')],
      [...PEC_HEADER, makeNurseAddr('Sestra Jana', 'Brno 1')],
    );
    const result = parseExcel(buf);
    expect(result.patients.errors).toHaveLength(0);
    expect(result.patients.data).toHaveLength(1);
    const visits = result.patients.data[0].visits;
    expect(visits).toHaveLength(1);
    return visits[0];
  }

  it('T1.1 — fraction 0.3125 → windowStart 07:30, windowEnd ANY (single time)', () => {
    const req = parseOneClient(0.3125);
    expect(req.windowStart).toBe('07:30');
    expect(req.windowEnd).toBe('ANY');
  });

  it('T1.2 — fraction 0.40277... → windowStart 09:40, windowEnd ANY', () => {
    // 9h 40min = 580min; 580/1440 ≈ 0.40277
    const frac = (9 * 60 + 40) / (24 * 60);
    const req = parseOneClient(frac);
    expect(req.windowStart).toBe('09:40');
    expect(req.windowEnd).toBe('ANY');
  });

  it('T1.3 — string "7:30-9:00" → windowStart 07:30, windowEnd 09:00', () => {
    const req = parseOneClient('7:30-9:00');
    expect(req.windowStart).toBe('07:30');
    expect(req.windowEnd).toBe('09:00');
  });

  it('T1.4 — string s tečkou "8.00-14:30" → windowStart 08:00, windowEnd 14:30', () => {
    const req = parseOneClient('8.00-14:30');
    expect(req.windowStart).toBe('08:00');
    expect(req.windowEnd).toBe('14:30');
  });

  it('T1.5 — string s mezerami "14:00 - 14:30" → windowStart 14:00, windowEnd 14:30', () => {
    const req = parseOneClient('14:00 - 14:30');
    expect(req.windowStart).toBe('14:00');
    expect(req.windowEnd).toBe('14:30');
  });

  it('T1.6 — string s mezerami "7:30 - 8:30" → windowStart 07:30, windowEnd 08:30', () => {
    const req = parseOneClient('7:30 - 8:30');
    expect(req.windowStart).toBe('07:30');
    expect(req.windowEnd).toBe('08:30');
  });

  it('T1.7 — null čas → windowStart ANY, windowEnd ANY', () => {
    // Pokud sestra nemá zadán čas, ale den je zatržen — chybí délka → error
    // Testujeme tedy případ s platnou délkou ale bez času
    const buf = buildWorkbook(
      [
        ...KLIENTI_HEADER,
        [true, 'Testovací Klient', 'Ulice 1, Brno', null,
          true, null, null, 45,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null],
      ],
      [...DOCH_HEADER, makeNurseRow('Sestra Jana')],
      [...PEC_HEADER, makeNurseAddr('Sestra Jana', 'Brno 1')],
    );
    const result = parseExcel(buf);
    expect(result.patients.data[0].visits[0].windowStart).toBe('ANY');
    expect(result.patients.data[0].visits[0].windowEnd).toBe('ANY');
  });

  it('T1.8 — náhradní čas "9:00-14:30" → backupWindowStart/End správně nastaveny', () => {
    const req = parseOneClient('13:00-14:30', '9:00-14:30');
    expect(req.backupWindowStart).toBe('09:00');
    expect(req.backupWindowEnd).toBe('14:30');
  });

  it('T1.9 — náhradní čas null → backupWindowStart undefined', () => {
    const req = parseOneClient('7:30-9:00', null);
    expect(req.backupWindowStart).toBeUndefined();
    expect(req.backupWindowEnd).toBeUndefined();
  });
});

// ── Testy pro parsování sester ───────────────────────────────────────────────

describe('excelParser — parsování sester', () => {
  it('T2.1 — sestra přítomna ve všech dnech → 5 DayAvailability záznamů', () => {
    const buf = buildWorkbook(
      [...KLIENTI_HEADER, [true, 'Klient A', 'Brno', null, true, null, null, 30, false, null, null, null, false, null, null, null, false, null, null, null, false, null, null, null]],
      [...DOCH_HEADER, makeNurseRow('Jana Nováková')],
      [...PEC_HEADER, makeNurseAddr('Jana Nováková', 'Náměstí 1, Brno')],
    );
    const result = parseExcel(buf);
    expect(result.nurses.errors).toHaveLength(0);
    expect(result.nurses.data).toHaveLength(1);
    const nurse = result.nurses.data[0];
    expect(nurse.name).toBe('Jana Nováková');
    expect(nurse.availability).toHaveLength(5);
    expect(nurse.availability[0].start).toBe('07:00');
    expect(nurse.availability[0].end).toBe('15:30');
  });

  it('T2.2 — sestra přítomna jen Po,St → 2 záznamy dostupnosti', () => {
    const dochRow = ['Marie Svobodová', true, false, true, false, false, null, null, null, null, null, null, null, null, null, null];
    const buf = buildWorkbook(
      [...KLIENTI_HEADER, [true, 'Klient A', 'Brno', null, true, null, null, 30, false, null, null, null, false, null, null, null, false, null, null, null, false, null, null, null]],
      [...DOCH_HEADER, dochRow],
      [...PEC_HEADER, makeNurseAddr('Marie Svobodová', 'Svratka 5')],
    );
    const result = parseExcel(buf);
    const nurse = result.nurses.data[0];
    expect(nurse.availability).toHaveLength(2);
    expect(nurse.availability.map((a) => a.day)).toEqual(['Po', 'St']);
  });

  it('T2.3 — přestávka (překážka) v pondělí → breaks obsahuje jeden interval', () => {
    // Přestávka z Excelu = překážka v práci (dovolená, lékař, …) → blokuje slot.
    const dochRow = ['Petra Horáková',
      true, false, false, false, false,
      '12:00', '12:30', null, null, null, null, null, null, null, null];
    const buf = buildWorkbook(
      [...KLIENTI_HEADER, [true, 'Klient A', 'Brno', null, true, null, null, 30, false, null, null, null, false, null, null, null, false, null, null, null, false, null, null, null]],
      [...DOCH_HEADER, dochRow],
      [...PEC_HEADER, makeNurseAddr('Petra Horáková', 'Blansko 2')],
    );
    const result = parseExcel(buf);
    const nurse = result.nurses.data[0];
    expect(nurse.availability[0].breaks).toHaveLength(1);
    expect(nurse.availability[0].breaks[0]).toEqual({ start: '12:00', end: '12:30' });
  });
});

// ── Testy pro parsování klientů ──────────────────────────────────────────────

describe('excelParser — parsování klientů', () => {
  it('T3.1 — klient s plan=false se neparsuje', () => {
    const buf = buildWorkbook(
      [
        ...KLIENTI_HEADER,
        [false, 'Nezatržený Klient', 'Brno', null, true, null, null, 60, false, null, null, null, false, null, null, null, false, null, null, null, false, null, null, null],
      ],
      [...DOCH_HEADER, makeNurseRow('Sestra Jana')],
      [...PEC_HEADER, makeNurseAddr('Sestra Jana', 'Brno')],
    );
    const result = parseExcel(buf);
    // Prázdný výsledek → chyba "žádný klient"
    expect(result.patients.data).toHaveLength(0);
  });

  it('T3.2 — dva řádky stejného klienta (2x/den) → jeden pacient, 2 VisitRequirements za den', () => {
    // Nečasová Jarmila: 7:00 ráno + 11:30-12:30 dopoledne každý den
    const buf = buildWorkbook(
      [
        ...KLIENTI_HEADER,
        // Řádek 1: ranní návštěva v Po
        [true, 'Nečasová Jarmila', 'Blansko 10', null,
          true, '7:00-8:00', null, 60,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null],
        // Řádek 2: dopolední návštěva v Po (stejný klient)
        [true, 'Nečasová Jarmila', 'Blansko 10', null,
          true, '11:30-12:30', null, 60,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null],
      ],
      [...DOCH_HEADER, makeNurseRow('Sestra Jana')],
      [...PEC_HEADER, makeNurseAddr('Sestra Jana', 'Brno')],
    );
    const result = parseExcel(buf);
    expect(result.patients.data).toHaveLength(1);
    const visits = result.patients.data[0].visits.filter((v) => v.day === 'Po');
    expect(visits).toHaveLength(2);
    const starts = visits.map((v) => v.windowStart).sort();
    expect(starts).toContain('07:00');
    expect(starts).toContain('11:30');
  });

  it('T3.3 — chybějící délka úkonu → chyba, návštěva se nepřidá', () => {
    const buf = buildWorkbook(
      [
        ...KLIENTI_HEADER,
        [true, 'Klient BezDélky', 'Brno', null,
          true, '8:00-9:00', null, null,  // délka null!
          false, null, null, null,
          false, null, null, null,
          false, null, null, null,
          false, null, null, null],
      ],
      [...DOCH_HEADER, makeNurseRow('Sestra Jana')],
      [...PEC_HEADER, makeNurseAddr('Sestra Jana', 'Brno')],
    );
    const result = parseExcel(buf);
    expect(result.patients.errors.length).toBeGreaterThan(0);
    // Klient existuje, ale bez návštěv
    if (result.patients.data.length > 0) {
      expect(result.patients.data[0].visits).toHaveLength(0);
    }
  });

  it('T3.4 — šablona vstup: chybějící listy → chyba', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'klienti');
    // záměrně chybí docházka a pečovatelky
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const result = parseExcel(buf);
    expect(result.nurses.errors[0]).toContain('"docházka"');
  });
});
