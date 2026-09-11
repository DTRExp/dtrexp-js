import { fieldsFromInstant, ZoneIndex, zoneIndex } from '../src/utils/index.js';

const H = 3_600_000;

describe('ZoneIndex', () => {
  it('reads the offset in effect, switching exactly at the transition instant', () => {
    const berlin = new ZoneIndex('Europe/Berlin');
    const spring = Date.UTC(2026, 2, 29, 1); // CET → CEST
    expect(berlin.offsetAt(spring - 1)).toBe(H);
    expect(berlin.offsetAt(spring)).toBe(2 * H);
    const fall = Date.UTC(2026, 9, 25, 1); // CEST → CET
    expect(berlin.offsetAt(fall - 1)).toBe(2 * H);
    expect(berlin.offsetAt(fall)).toBe(H);
    expect(berlin.offsetAt(Date.UTC(2026, 6, 1))).toBe(2 * H);
  });

  it('locates the first transition in a range, or none', () => {
    const berlin = new ZoneIndex('Europe/Berlin');
    const spring = Date.UTC(2026, 2, 29, 1);
    expect(berlin.transitionIn(Date.UTC(2026, 2, 1), Date.UTC(2026, 3, 1))).toBe(spring);
    expect(berlin.transitionIn(spring, Date.UTC(2026, 3, 1))).toBeNaN(); // half-open: (a, b]
    expect(berlin.transitionIn(spring - 1, spring)).toBe(spring);
    // same 7-day cell as the transition, but ending before it
    expect(berlin.transitionIn(spring - 2 * H, spring - H)).toBeNaN();
    expect(berlin.transitionIn(Date.UTC(2026, 5, 1), Date.UTC(2026, 6, 1))).toBeNaN();
    expect(new ZoneIndex('Asia/Kolkata').transitionIn(0, Date.UTC(2030, 0, 1))).toBeNaN();
  });

  it('handles half-hour shifts and negative offsets', () => {
    const lordHowe = new ZoneIndex('Australia/Lord_Howe');
    const t = Date.UTC(2024, 9, 5, 15, 30); // 02:00 +10:30 → 02:30 +11:00
    expect(lordHowe.offsetAt(t - 1)).toBe(10.5 * H);
    expect(lordHowe.offsetAt(t)).toBe(11 * H);
    const santiago = new ZoneIndex('America/Santiago');
    expect(santiago.offsetAt(Date.UTC(2024, 8, 8, 12))).toBe(-3 * H);
    expect(santiago.offsetAt(Date.UTC(2024, 8, 7, 12))).toBe(-4 * H);
  });

  it('agrees with a direct field extraction across a decade of weeks', () => {
    const berlin = new ZoneIndex('Europe/Berlin');
    for (let t = Date.UTC(2020, 0, 1); t < Date.UTC(2030, 0, 1); t += 6.5 * 24 * H) {
      expect(berlin.offsetAt(t)).toBe(fieldsFromInstant(t, 'Europe/Berlin').pseudo - t);
    }
  });

  it('keeps answering correctly after the cell cap clears the index', () => {
    const berlin = new ZoneIndex('Europe/Berlin', 4);
    const week = 7 * 24 * H;
    const from = Date.UTC(2026, 0, 1);
    for (let k = 0; k <= 9; k++) berlin.offsetAt(from + k * week);
    expect(berlin.offsetAt(Date.UTC(2026, 2, 29, 1))).toBe(2 * H);
    expect(berlin.offsetAt(Date.UTC(2026, 2, 29, 1) - 1)).toBe(H);
    expect(berlin.offsetAt(from)).toBe(H);
  });

  it('shares one index per zone', () => {
    expect(zoneIndex('Europe/Berlin')).toBe(zoneIndex('Europe/Berlin'));
    expect(zoneIndex('Europe/Berlin')).not.toBe(zoneIndex('Europe/London'));
  });
});
