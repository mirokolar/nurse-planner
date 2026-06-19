/**
 * Testy pro timeUtils.ts
 */

import { describe, it, expect } from 'vitest';
import { toMinutes, fromMinutes, findAvailableSlot } from '../timeUtils';

describe('toMinutes', () => {
  it('"07:00" → 420', () => expect(toMinutes('07:00')).toBe(420));
  it('"15:30" → 930', () => expect(toMinutes('15:30')).toBe(930));
  it('"00:00" → 0', () => expect(toMinutes('00:00')).toBe(0));
  it('"12:45" → 765', () => expect(toMinutes('12:45')).toBe(765));
});

describe('fromMinutes', () => {
  it('420 → "07:00"', () => expect(fromMinutes(420)).toBe('07:00'));
  it('930 → "15:30"', () => expect(fromMinutes(930)).toBe('15:30'));
  it('0 → "00:00"', () => expect(fromMinutes(0)).toBe('00:00'));
  it('765 → "12:45"', () => expect(fromMinutes(765)).toBe('12:45'));
});

describe('findAvailableSlot', () => {
  const noBreaks: { start: string; end: string }[] = [];

  it('bez přestávek → vrátí fromMin', () => {
    expect(findAvailableSlot(480, 60, 930, noBreaks)).toBe(480);
  });

  it('slot se překrývá s přestávkou → přesune za přestávku', () => {
    const breaks = [{ start: '09:00', end: '09:30' }];
    // od 08:30, délka 60 min → 08:30-09:30 → překryv → odsunutí na 09:30
    expect(findAvailableSlot(510, 60, 930, breaks)).toBe(570); // 09:30
  });

  it('slot se nevejde do směny → vrátí null', () => {
    expect(findAvailableSlot(900, 60, 930, noBreaks)).toBeNull(); // 900+60=960>930
  });

  it('slot začíná přesně za přestávkou → OK', () => {
    const breaks = [{ start: '12:00', end: '12:30' }];
    // od 12:30 = 750 min, délka 30 → OK
    expect(findAvailableSlot(750, 30, 930, breaks)).toBe(750);
  });
});
