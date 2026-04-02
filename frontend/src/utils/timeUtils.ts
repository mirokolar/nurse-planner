/** Převede "HH:MM" na počet minut od půlnoci */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Převede počet minut od půlnoci na "HH:MM" */
export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Vrátí true pokud se dva intervaly překrývají */
export function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Vrátí true pokud je čas (minuty) uvnitř přestávky */
export function isDuringBreak(
  startMin: number,
  endMin: number,
  breaks: Array<{ start: string; end: string }>,
): boolean {
  return breaks.some((b) =>
    overlaps(startMin, endMin, toMinutes(b.start), toMinutes(b.end)),
  );
}

/** Najde nejbližší dostupný slot od `fromMin` uvnitř směny sestra, přeskočí přestávky */
export function findAvailableSlot(
  fromMin: number,
  durationMin: number,
  shiftEnd: number,
  breaks: Array<{ start: string; end: string }>,
): number | null {
  let cursor = fromMin;
  const maxAttempts = 200;
  for (let i = 0; i < maxAttempts; i++) {
    const slotEnd = cursor + durationMin;
    if (slotEnd > shiftEnd) return null;
    if (!isDuringBreak(cursor, slotEnd, breaks)) return cursor;
    // přesun za konec nejbližší překrývající se přestávky
    const hit = breaks.find((b) =>
      overlaps(cursor, slotEnd, toMinutes(b.start), toMinutes(b.end)),
    );
    if (!hit) return cursor;
    cursor = toMinutes(hit.end);
  }
  return null;
}
