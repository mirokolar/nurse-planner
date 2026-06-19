/**
 * Testy pro scheduler.ts
 *
 * Scénáře:
 *   T4 — Žádné překrývání návštěv téže sestry
 *   T5 — Všichni klienti naplánováni (dostatek kapacity)
 *   T6 — Progresivní uvolňování: klient v náhradním čase dostane usedBackupTime=true
 *   T7 — Klient bez naplánování (nedostatek kapacity)
 *   T8 — Sestra začíná ze svého domova (první travel ze správného indexu)
 *   T9 — Geografická optimalizace: sestra jde k bližšímu klientovi první
 *   T10 — Klient s velmi úzkým oknem (14:00-14:30) se naplánuje (= fit do směny)
 *   T11 — Dvojí návštěva téhož klienta za den (2 VisitRequirements)
 *   T12 — Dlouhý úkon (390 min) − 8 nurses, klient je naplánován
 *   T13 — Přestávka sestry blokuje slot; sestra pokračuje po přestávce
 */

import { describe, it, expect } from 'vitest';
import { schedule } from '../scheduler';
import type { Nurse, Patient, VisitRequirement } from '../../types';

// ── Pomocné továrny ──────────────────────────────────────────────────────────

function nurse(
  name: string,
  days: string[] = ['Po', 'Ut', 'St', 'Ct', 'Pa'],
  start = '07:00',
  end = '15:30',
  breaks: { start: string; end: string }[] = [],
): Nurse {
  return {
    name,
    availability: days.map((day) => ({ day: day as never, start, end, breaks })),
  };
}

function patient(
  id: string,
  name: string,
  visits: Partial<VisitRequirement>[],
): Patient {
  return {
    id,
    name,
    address: 'Testovací 1, Brno',
    visits: visits.map((v) => ({
      patientId: id,
      day: 'Po',
      windowStart: 'ANY',
      windowEnd: 'ANY',
      durationMin: 60,
      ...v,
    })) as VisitRequirement[],
  };
}

/** Nulová matice (bez cestovních časů) — vhodná pro testy logiky oken */
function zeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

/** Matice, kde jízda mezi bodly a↔b trvá `seconds` sekund */
function sparseMatrix(size: number, pairs: [number, number, number][]): number[][] {
  const m = zeroMatrix(size);
  for (const [a, b, sec] of pairs) {
    m[a][b] = sec;
    m[b][a] = sec;
  }
  return m;
}

// ── T4: Žádné překrývání ─────────────────────────────────────────────────────

describe('T4 — Žádné překrývání návštěv téže sestry', () => {
  it('3 klienti s ANY oknem, 1 sestra — žádný slot se nepřekryje', () => {
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 60 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 45 }]),
      patient('p3', 'Klient C', [{ day: 'Po', durationMin: 30 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(3), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(0);

    const visits = result.days['Po'].visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    for (let i = 1; i < visits.length; i++) {
      expect(visits[i].arrivalTime >= visits[i - 1].departureTime).toBe(true);
    }
  });
});

// ── T5: Všichni klienti naplánováni ─────────────────────────────────────────

describe('T5 — Všichni klienti naplánováni', () => {
  it('2 sestry, 8 klientů po 60 min → 0 nenaplánovaných', () => {
    const nurses = [nurse('Jana'), nurse('Marie')];
    const patients = Array.from({ length: 8 }, (_, i) =>
      patient(`p${i}`, `Klient ${i}`, [{ day: 'Po', durationMin: 60 }]),
    );
    const result = schedule(nurses, patients, zeroMatrix(8), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(0);
    expect(result.days['Po'].visits).toHaveLength(8);
  });
});

// ── T6: usedBackupTime ───────────────────────────────────────────────────────

describe('T6 — Progresivní uvolňování a usedBackupTime', () => {
  it('Klient s ideálním oknem, které nelze obsloužit → dostane náhradní čas → usedBackupTime=true', () => {
    // Jedna sestra, směna 07:00-15:30
    // Klient P1 zabere 07:00-14:00 (420 min) → okamžik P2 není dostupný v ideálním čase
    // P2 má ideální čas 07:00-08:00, ale ten je obsazen P1
    // P2 má náhradní čas 13:00-14:00 → závisí na délce P1
    const nurses = [nurse('Jana')];
    const p1 = patient('p1', 'Velký Klient', [{ day: 'Po', windowStart: '07:00', windowEnd: '14:30', durationMin: 420 }]);
    const p2 = patient('p2', 'Malý Klient', [{
      day: 'Po',
      windowStart: '07:00',
      windowEnd: '08:00',
      backupWindowStart: '14:15',
      backupWindowEnd: '15:00',
      durationMin: 30,
    }]);
    const result = schedule(nurses, [p1, p2], zeroMatrix(2), '2026-W15', 'Po');

    expect(result.unscheduled).toHaveLength(0);
    const p2Visit = result.days['Po'].visits.find((v) => v.patient.id === 'p2');
    expect(p2Visit).toBeDefined();
    expect(p2Visit!.usedBackupTime).toBe(true);
  });

  it('Klient s ANY oknem nikdy nemá usedBackupTime', () => {
    const nurses = [nurse('Jana')];
    const p = patient('p1', 'Klient A', [{ day: 'Po', windowStart: 'ANY', windowEnd: 'ANY', durationMin: 60 }]);
    const result = schedule(nurses, [p], zeroMatrix(1), '2026-W15', 'Po');
    const visit = result.days['Po'].visits[0];
    expect(visit.usedBackupTime).toBe(false);
  });
});

// ── T7: Klient nenaplánován ──────────────────────────────────────────────────

describe('T7 — Klient nenaplánován při nedostatku kapacity', () => {
  it('1 sestra, 2 klienti × 420 min → druhý nenaplánován', () => {
    // Směna 07:00-15:30 = 510 min, první klient zabere 420 min, druhý se nevejde
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 420 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 420 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(2), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(1);
    expect(result.unscheduled[0].patientName).toBe('Klient B');
  });
});

// ── T8: Start ze správného indexu (domov sestry) ─────────────────────────────

describe('T8 — Sestra začíná ze svého domova', () => {
  it('travelFromPrevMin první návštěvy odpovídá vzdálenosti domova sestry', () => {
    // Matice: patient index 0, nurse home index 1
    // Jízda 1→0 = 600 sekund = 10 min + buffer 10 = 20 min, zaokrouhleno na 15 = 20 (≥15, ≤30)
    const matrix = sparseMatrix(2, [[1, 0, 600]]);
    const nurses = [nurse('Jana')];
    const nurseHomeMap = new Map([['Jana', 1]]);
    const patients = [patient('p1', 'Klient A', [{ day: 'Po', durationMin: 30 }])];
    const result = schedule(nurses, patients, matrix, '2026-W15', 'Po', true, nurseHomeMap);
    const visit = result.days['Po'].visits[0];
    // getTravelMin: ceil(600/60)+10 = 10+10 = 20 min
    expect(visit.travelFromPrevMin).toBe(20);
  });
});

// ── T9: Geografická optimalizace ─────────────────────────────────────────────

describe('T9 — Geografická optimalizace (nearest neighbor)', () => {
  it('Sestra B je blíž ke klientovi p2 → p2 přiřazen sestře B', () => {
    // 2 sestry, 2 klienti
    // p1 = index 0, p2 = index 1
    // Sestra A home = index 2, Sestra B home = index 3
    // Vzdálenosti: A→p1 = 60s, A→p2 = 3600s (daleko)
    //              B→p1 = 3600s, B→p2 = 60s (blíž)
    // Oba mají ANY okno → NN algoritmus by měl A→p1, B→p2
    const matrix = sparseMatrix(4, [
      [2, 0, 60],    // A home → p1: blízko
      [2, 1, 3600],  // A home → p2: daleko
      [3, 0, 3600],  // B home → p1: daleko
      [3, 1, 60],    // B home → p2: blízko
    ]);
    const nurses = [nurse('Jana'), nurse('Marie')];
    const nurseHomeMap = new Map([['Jana', 2], ['Marie', 3]]);
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 60 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 60 }]),
    ];
    const result = schedule(nurses, patients, matrix, '2026-W15', 'Po', false, nurseHomeMap);
    expect(result.unscheduled).toHaveLength(0);

    const visits = result.days['Po'].visits;
    const janaVisit = visits.find((v) => v.nurse.name === 'Jana');
    const marieVisit = visits.find((v) => v.nurse.name === 'Marie');

    expect(janaVisit?.patient.id).toBe('p1');
    expect(marieVisit?.patient.id).toBe('p2');
  });
});

// ── T10: Úzké časové okno ────────────────────────────────────────────────────

describe('T10 — Klient s úzkým oknem 14:00-14:30', () => {
  it('Klient se naplánuje do správného okna (14:00-14:30) bez přeplánování', () => {
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Skalická', [{ day: 'Po', windowStart: '14:00', windowEnd: '14:30', durationMin: 60 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(1), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(0);
    const visit = result.days['Po'].visits[0];
    // Příjezd musí být ≥ 14:00 a ≤ 14:30
    expect(visit.arrivalTime >= '14:00').toBe(true);
    expect(visit.arrivalTime <= '14:30').toBe(true);
    // Odchod: 14:00+ + 60min = 15:00+
    expect(visit.departureTime <= '15:30').toBe(true);
  });
});

// ── T11: Dvojí návštěva téhož klienta za den ─────────────────────────────────

describe('T11 — Dvojí návštěva téhož klienta za den', () => {
  it('Klient se 2 VisitRequirements pro Po → 2 naplánované návštěvy', () => {
    const nurses = [nurse('Jana')];
    const p = patient('nec', 'Nečasová Jarmila', [
      { day: 'Po', windowStart: '07:00', windowEnd: '08:00', durationMin: 60 },
      { day: 'Po', windowStart: '11:30', windowEnd: '12:30', durationMin: 60 },
    ]);
    const result = schedule(nurses, [p], zeroMatrix(1), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(0);
    const visits = result.days['Po'].visits;
    expect(visits).toHaveLength(2);
    const times = visits.map((v) => v.arrivalTime).sort();
    expect(times[0] >= '07:00' && times[0] <= '08:00').toBe(true);
    expect(times[1] >= '11:30' && times[1] <= '12:30').toBe(true);
  });
});

// ── T12: Dlouhý úkon ─────────────────────────────────────────────────────────

describe('T12 — Dlouhý úkon (390 minut)', () => {
  it('Skácelová Jana — 390min úkon — naplánuje se s jednou sestrou', () => {
    // Směna 07:00-15:30 = 510 min; 390 min se vejde
    const nurses = [nurse('Jana')];
    const patients = [
      patient('skacelova', 'Skácelová Jana', [{ day: 'Po', windowStart: '09:00', windowEnd: 'ANY', durationMin: 390 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(1), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(0);
    const visit = result.days['Po'].visits[0];
    // Start ≥ 09:00, konec ≤ 15:30
    expect(visit.arrivalTime >= '09:00').toBe(true);
    expect(visit.departureTime <= '15:30').toBe(true);
  });

  it('Úkon delší než směna (511 min) → nelze naplánovat', () => {
    // Směna 07:00-15:30 = 510 min; latestStart = 930-511 = 419 < earliestStart 420 → fail
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p_toolong', 'Příliš Dlouhý', [{ day: 'Po', durationMin: 511 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(1), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(1);
  });
});

// ── T13: Přestávka blokuje slot ───────────────────────────────────────────────

describe('T13 — Přestávka sestry blokuje slot', () => {
  it('Klient by spadl do přestávky → sestra ho naplánuje až po přestávce', () => {
    const breaks = [{ start: '09:00', end: '09:30' }];
    const nurses = [{
      name: 'Jana',
      availability: [{ day: 'Po' as never, start: '07:00', end: '15:30', breaks }],
    }];
    // Klient 1: 60 min od 07:00 → 07:00-08:00 (OK)
    // Klient 2: 60 min — bez okna, začal by na 08:00, ale to je před přestávkou — 08:00+60=09:00 → přesně na hranici přestávky
    // Třetí klient by měl začít nejdříve v 09:30
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 60 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 60 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(2), '2026-W15', 'Po');
    expect(result.unscheduled).toHaveLength(0);
    const visits = result.days['Po'].visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    // Žádná návštěva nesmí překrývat přestávku 09:00-09:30
    for (const v of visits) {
      const vStart = v.arrivalTime;
      const vEnd = v.departureTime;
      const breakStart = '09:00';
      const breakEnd = '09:30';
      const overlaps = vStart < breakEnd && breakStart < vEnd;
      expect(overlaps).toBe(false);
    }
  });
});

// ── T14: Ideální plán bez oken ────────────────────────────────────────────────

describe('T14 — Ideální plán (constrainedMode=false)', () => {
  it('Klient s úzkým oknem dostane ANY slot v ideálním plánu', () => {
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', windowStart: '14:00', windowEnd: '14:30', durationMin: 60 }]),
      patient('p2', 'Klient B', [{ day: 'Po', windowStart: '07:00', windowEnd: '07:30', durationMin: 60 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(2), '2026-W15', 'Po', false);
    expect(result.unscheduled).toHaveLength(0);
    // V ideálním plánu sestra obsluhuje oba klienty jeden po druhém, bez ohledu na okna
    expect(result.days['Po'].visits).toHaveLength(2);
  });
});

// ── T15: startDay — plánování od středy ──────────────────────────────────────

describe('T15 — Plánování od zadaného startDay', () => {
  it('startDay=St → Po a Ut jsou prázdné, St+ má návštěvy', () => {
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Klient A', [
        { day: 'Po', durationMin: 60 },
        { day: 'St', durationMin: 60 },
        { day: 'Pa', durationMin: 60 },
      ]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(1), '2026-W15', 'St');
    expect(result.days['Po'].visits).toHaveLength(0);
    expect(result.days['Ut'].visits).toHaveLength(0);
    expect(result.days['St'].visits).toHaveLength(1);
    expect(result.days['Pa'].visits).toHaveLength(1);
    // Po a Ut jsou v unscheduled? Ne — startDay přeskočí je tiše
    expect(result.unscheduled.filter((u) => u.requirement.day === 'St')).toHaveLength(0);
  });
});

// ── T16: 30min přestávka na odpočinek (start ≤ 13:00) ────────────────────────

describe('T16 — Povinná 30min přestávka na odpočinek', () => {
  it('Sestra s návštěvami má 30min přestávku se startem nejpozději ve 13:00', () => {
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 60 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 60 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(2), '2026-W15', 'Po');
    const visits = result.days['Po'].visits;

    const rest = visits.map((v) => v.restBefore ?? v.restAfter).find(Boolean);
    expect(rest).toBeDefined();
    // Trvání přesně 30 min
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    expect(toMin(rest!.end) - toMin(rest!.start)).toBe(30);
    // Start nejpozději ve 13:00
    expect(rest!.start <= '13:00').toBe(true);
  });

  it('Návštěvy se nepřekrývají s vloženou přestávkou ani mezi sebou', () => {
    const nurses = [nurse('Jana')];
    const patients = Array.from({ length: 3 }, (_, i) =>
      patient(`p${i}`, `Klient ${i}`, [{ day: 'Po', durationMin: 45 }]),
    );
    const result = schedule(nurses, patients, zeroMatrix(3), '2026-W15', 'Po');
    const visits = result.days['Po'].visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    for (let i = 1; i < visits.length; i++) {
      expect(visits[i].arrivalTime >= visits[i - 1].departureTime).toBe(true);
    }
    // Žádná návštěva nepřekrývá svou přestávku
    for (const v of visits) {
      const r = v.restBefore ?? v.restAfter;
      if (!r) continue;
      const overlap = v.arrivalTime < r.end && r.start < v.departureTime;
      expect(overlap).toBe(false);
    }
  });
});

// ── T18: Zaokrouhlení příjezdů na celé desítky minut ─────────────────────────

describe('T18 — Příjezdy zaokrouhlené na celé desítky minut', () => {
  it('Příjezdy s cestovním časem dávají časy na desítkách (constrained i ideální)', () => {
    // Domov sestry idx 2, p1 idx 0, p2 idx 1 — jízdy generující "ošklivé" minuty
    const matrix = sparseMatrix(3, [
      [2, 0, 200],  // home→p1: ceil(200/60)=4 +10 = 14 min
      [0, 1, 130],  // p1→p2: ceil(130/60)=3 +10 = 13 min
    ]);
    const nurses = [nurse('Jana')];
    const nurseHomeMap = new Map([['Jana', 2]]);
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 45 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 35 }]),
    ];

    for (const constrained of [true, false]) {
      const result = schedule(nurses, patients, matrix, '2026-W15', 'Po', constrained, nurseHomeMap);
      for (const v of result.days['Po'].visits) {
        const min = Number(v.arrivalTime.slice(0, 2)) * 60 + Number(v.arrivalTime.slice(3));
        expect(min % 10).toBe(0);
      }
    }
  });
});

// ── T17: Komfortní pauzy při nižším vytížení ─────────────────────────────────

describe('T17 — Komfortní pauzy mezi návštěvami při volné kapacitě', () => {
  it('Den s malým vytížením → mezi návštěvami vznikne pauza (5–20 min)', () => {
    const nurses = [nurse('Jana')];
    const patients = [
      patient('p1', 'Klient A', [{ day: 'Po', durationMin: 60 }]),
      patient('p2', 'Klient B', [{ day: 'Po', durationMin: 60 }]),
    ];
    const result = schedule(nurses, patients, zeroMatrix(2), '2026-W15', 'Po');
    const visits = result.days['Po'].visits.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime));
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    // Mezi koncem 1. a začátkem 2. návštěvy je pauza (po odečtení případné přestávky)
    const restBetween = visits[1].restBefore;
    const restLen = restBetween ? 30 : 0;
    const gap = toMin(visits[1].arrivalTime) - toMin(visits[0].departureTime) - restLen;
    expect(gap).toBeGreaterThanOrEqual(5);
    expect(gap).toBeLessThanOrEqual(20);
  });
});
