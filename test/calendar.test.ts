import { epochFromPseudo } from '../src/utils/calendar.js';
import {
  addMonthsConstrain,
  civilFromDays,
  dayOfQuarter,
  dayOfYear,
  daysInMonth,
  daysInQuarter,
  daysInYear,
  epochDay,
  epochFromLocal,
  fieldsFromInstant,
  isLeapYear,
  isoWeekOf,
  monthsBetween,
  quarterOf,
  weekdayOf,
  weeksInIsoYear
} from '../src/utils/index.js';

describe('calendar: leap years & lengths', () => {
  it('applies the 4/100/400 rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2400)).toBe(true);
  });

  it('computes month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(31);
    expect(daysInMonth(2024, 4)).toBe(30);
    expect(daysInMonth(2024, 12)).toBe(31);
  });

  it('computes year and quarter lengths', () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2023)).toBe(365);
    expect(daysInQuarter(2024, 1)).toBe(91);
    expect(daysInQuarter(2023, 1)).toBe(90);
    expect(daysInQuarter(2024, 2)).toBe(91);
    expect(daysInQuarter(2024, 4)).toBe(92);
  });
});

describe('calendar: epoch days & weekdays', () => {
  it('matches Date.UTC for civil dates across eras', () => {
    const samples: Array<[number, number, number]> = [
      [1970, 1, 1],
      [1969, 12, 31],
      [2000, 2, 29],
      [2024, 3, 1],
      [2100, 2, 28],
      [1900, 3, 1]
    ];
    for (const [y, m, d] of samples) {
      expect(epochDay(y, m, d)).toBe(Date.UTC(y, m - 1, d) / 86_400_000);
    }
  });

  it('computes ISO weekdays (1=Mon … 7=Sun)', () => {
    expect(weekdayOf(1970, 1, 1)).toBe(4);
    expect(weekdayOf(2026, 7, 6)).toBe(1);
    expect(weekdayOf(2026, 7, 7)).toBe(2);
    expect(weekdayOf(2018, 3, 3)).toBe(6);
    expect(weekdayOf(2026, 4, 26)).toBe(7);
  });

  it('computes day-of-year and day-of-quarter', () => {
    expect(dayOfYear(2024, 1, 1)).toBe(1);
    expect(dayOfYear(2024, 12, 25)).toBe(360);
    expect(dayOfYear(2023, 12, 25)).toBe(359);
    expect(quarterOf(1)).toBe(1);
    expect(quarterOf(3)).toBe(1);
    expect(quarterOf(4)).toBe(2);
    expect(quarterOf(12)).toBe(4);
    expect(dayOfQuarter(2024, 4, 1)).toBe(1);
    expect(dayOfQuarter(2024, 5, 10)).toBe(40);
  });
});

describe('calendar: ISO weeks', () => {
  it('knows which week-years have 53 weeks', () => {
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2021)).toBe(52);
    expect(weeksInIsoYear(2015)).toBe(53);
    expect(weeksInIsoYear(2019)).toBe(52);
    expect(weeksInIsoYear(2026)).toBe(53);
  });

  it('assigns week and week-year across year boundaries', () => {
    expect(isoWeekOf(2025, 12, 29)).toEqual({ week: 1, weekYear: 2026 });
    expect(isoWeekOf(2026, 1, 1)).toEqual({ week: 1, weekYear: 2026 });
    expect(isoWeekOf(2026, 1, 15)).toEqual({ week: 3, weekYear: 2026 });
    expect(isoWeekOf(2020, 12, 30)).toEqual({ week: 53, weekYear: 2020 });
    expect(isoWeekOf(2021, 12, 30)).toEqual({ week: 52, weekYear: 2021 });
    expect(isoWeekOf(2026, 12, 28)).toEqual({ week: 53, weekYear: 2026 });
    expect(isoWeekOf(2016, 1, 1)).toEqual({ week: 53, weekYear: 2015 });
  });
});

describe('calendar: constrain month arithmetic', () => {
  it('clamps to the last valid day', () => {
    expect(addMonthsConstrain(2024, 1, 31, 1)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(addMonthsConstrain(2023, 1, 31, 1)).toEqual({ year: 2023, month: 2, day: 28 });
    expect(addMonthsConstrain(2024, 1, 31, 3)).toEqual({ year: 2024, month: 4, day: 30 });
    expect(addMonthsConstrain(2024, 11, 15, 2)).toEqual({ year: 2025, month: 1, day: 15 });
    expect(addMonthsConstrain(2024, 3, 31, -1)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(addMonthsConstrain(2024, 1, 15, -13)).toEqual({ year: 2022, month: 12, day: 15 });
  });

  it('counts whole months constrain-aware', () => {
    const a = { year: 2018, month: 3, day: 1, msOfDay: 0 };
    expect(monthsBetween(a, { year: 2018, month: 3, day: 15, msOfDay: 0 })).toBe(0);
    expect(monthsBetween(a, { year: 2018, month: 4, day: 1, msOfDay: 0 })).toBe(1);
    expect(monthsBetween(a, { year: 2018, month: 2, day: 15, msOfDay: 0 })).toBe(-1);
    const endOfJan = { year: 2024, month: 1, day: 31, msOfDay: 0 };
    expect(monthsBetween(endOfJan, { year: 2024, month: 2, day: 29, msOfDay: 0 })).toBe(1);
    expect(monthsBetween(endOfJan, { year: 2024, month: 2, day: 28, msOfDay: 0 })).toBe(0);
  });
});

describe('calendar: time-zone field extraction', () => {
  it('extracts UTC fields via the fast path', () => {
    const f = fieldsFromInstant(Date.UTC(2026, 6, 7, 10, 30, 15, 250), 'UTC');
    expect(f.year).toBe(2026);
    expect(f.month).toBe(7);
    expect(f.day).toBe(7);
    expect(f.weekday).toBe(2);
    expect(f.quarter).toBe(3);
    expect(f.hour).toBe(10);
    expect(f.minute).toBe(30);
    expect(f.second).toBe(15);
    expect(f.msOfDay).toBe(10 * 3_600_000 + 30 * 60_000 + 15_000 + 250);
  });

  it('extracts zoned fields across DST transitions (Europe/Berlin)', () => {
    const spring = fieldsFromInstant(Date.UTC(2026, 2, 29, 1, 30), 'Europe/Berlin');
    expect([spring.hour, spring.minute]).toEqual([3, 30]);
    const overlapEarly = fieldsFromInstant(Date.UTC(2026, 9, 25, 0, 30), 'Europe/Berlin');
    expect([overlapEarly.hour, overlapEarly.minute]).toEqual([2, 30]);
    const overlapLate = fieldsFromInstant(Date.UTC(2026, 9, 25, 1, 30), 'Europe/Berlin');
    expect([overlapLate.hour, overlapLate.minute]).toEqual([2, 30]);
    const summer = fieldsFromInstant(Date.UTC(2026, 6, 7, 7, 30), 'Europe/Berlin');
    expect([summer.hour, summer.minute]).toEqual([9, 30]);
  });

  it('converts local wall-clock times to instants', () => {
    expect(epochFromLocal('UTC', 2026, 7, 7, 12, 0, 0)).toBe(Date.UTC(2026, 6, 7, 12));
    expect(epochFromLocal('Europe/Berlin', 2026, 7, 7, 9, 30, 0)).toBe(Date.UTC(2026, 6, 7, 7, 30));
    expect(epochFromLocal('Europe/Berlin', 2026, 1, 7, 9, 30, 0)).toBe(Date.UTC(2026, 0, 7, 8, 30));
  });

  it('resolves DST-gap local times forward and repeated ones to the earlier pass', () => {
    // 02:30 on spring-forward day does not exist → constrain forward to 03:30 CEST
    expect(epochFromLocal('Europe/Berlin', 2026, 3, 29, 2, 30, 0)).toBe(
      Date.UTC(2026, 2, 29, 1, 30)
    );
    // 02:30 on fall-back day happens twice → the earlier (CEST, +02:00), per Temporal
    // `compatible`. This zone is east of UTC; America/New_York exercises the west side.
    expect(epochFromLocal('Europe/Berlin', 2026, 10, 25, 2, 30, 0)).toBe(
      Date.UTC(2026, 9, 25, 0, 30)
    );
  });

  it('resolves a valid local time on the hour before a spring-forward gap', () => {
    // 01:30 local is CET (+1) and exists exactly once, at 00:30Z
    expect(epochFromLocal('Europe/Berlin', 2026, 3, 29, 1, 30, 0)).toBe(
      Date.UTC(2026, 2, 29, 0, 30)
    );
  });
});

describe('civilFromDays — inverse of epochDay', () => {
  it('round-trips civil dates across a wide range', () => {
    for (const [y, m, d] of [
      [1901, 1, 1],
      [1970, 1, 1],
      [2000, 2, 29],
      [2024, 12, 31],
      [2026, 3, 8],
      [2100, 2, 28],
      [2400, 2, 29]
    ] as Array<[number, number, number]>) {
      expect(civilFromDays(epochDay(y, m, d))).toEqual({ year: y, month: m, day: d });
    }
  });
});

describe('monthsBetween — cross-year', () => {
  it('counts whole months across year boundaries', () => {
    const a = { year: 2018, month: 11, day: 15, msOfDay: 0 };
    expect(monthsBetween(a, { year: 2019, month: 11, day: 15, msOfDay: 0 })).toBe(12);
    expect(monthsBetween(a, { year: 2020, month: 5, day: 10, msOfDay: 0 })).toBe(17);
    const anchor = { year: 2018, month: 3, day: 1, msOfDay: 0 };
    expect(monthsBetween(anchor, { year: 2019, month: 5, day: 10, msOfDay: 0 })).toBe(14);
  });
});

describe('fieldsFromInstant — zoned seconds and milliseconds', () => {
  it('extracts seconds and sub-second ms through the Intl path', () => {
    const f = fieldsFromInstant(Date.UTC(2026, 6, 7, 7, 30, 45, 250), 'Europe/Berlin');
    expect(f.second).toBe(45);
    expect(f.msOfDay % 1000).toBe(250);
    expect([f.hour, f.minute]).toEqual([9, 30]); // +2 summer offset
  });
});

describe('calendar: mutation-hardening — wide-range and boundary behaviour', () => {
  const MS_PER_DAY = 86_400_000;

  // civilFromDays' century correction (+floor(doe/36_524)) only changes the computed
  // year-of-era on the days where the running total crosses a 365 boundary — the 1 Mar
  // after a century's worth of day-of-era. Round-tripping mid-year dates never sees it.
  it('inverts epochDay across century and era boundaries', () => {
    const dates: Array<[number, number, number]> = [
      [1600, 3, 1], // first day of era 4
      [1899, 12, 31],
      [1900, 3, 1], // century correction engages
      [1970, 3, 1], // century correction engages
      [2000, 2, 29], // last day of era 4 (leap)
      [2000, 3, 1], // first day of era 5
      [2100, 6, 15],
      [2399, 12, 31],
      [2400, 2, 29] // last day of era 5
    ];
    for (const [year, month, day] of dates) {
      expect(civilFromDays(epochDay(year, month, day))).toEqual({ year, month, day });
    }
  });

  it('reports 52 ISO weeks in a short year and 53 in a long one', () => {
    // ground truth: a year is long iff 1 Jan is Thursday, or Wednesday in a leap year
    expect(weeksInIsoYear(2021)).toBe(52);
    expect(weeksInIsoYear(2024)).toBe(52);
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2026)).toBe(53);
  });

  // monthsBetween compares pseudo-instants; the sub-second component decides the
  // tie when the landing date and the target date are the same calendar day.
  it('counts a partial month as zero when only sub-second time is short', () => {
    const a = { year: 2024, month: 1, day: 31, msOfDay: 5 };
    const b = { year: 2024, month: 2, day: 29, msOfDay: 3 };
    expect(monthsBetween(a, b)).toBe(0); // lands on Feb 29 at ms=5, b is 2ms earlier
  });

  it('counts a whole month when the sub-second time reaches the landing', () => {
    const a = { year: 2024, month: 1, day: 31, msOfDay: 3 };
    const b = { year: 2024, month: 2, day: 29, msOfDay: 5 };
    expect(monthsBetween(a, b)).toBe(1);
  });

  it('normalises sub-second ms for pre-epoch instants on the Intl path', () => {
    // -1500ms is 1969-12-31T23:59:58.500Z, i.e. 01:59:58.500 in Istanbul (+02:00).
    // msOfDay must be asserted exactly: a negative ms of -500 is congruent to +500
    // modulo 1000, so `msOfDay % 1000` cannot distinguish a broken wrap from a sound one.
    const pre = fieldsFromInstant(-1500, 'Europe/Istanbul');
    expect([pre.hour, pre.minute, pre.second]).toEqual([1, 59, 58]);
    expect(pre.msOfDay).toBe(1 * 3_600_000 + 59 * 60_000 + 58 * 1000 + 500);

    const post = fieldsFromInstant(1_000_000_123, 'Europe/Istanbul');
    expect(post.msOfDay % 1000).toBe(123);
  });

  it('preserves sub-second ms through epochFromPseudo', () => {
    const pseudo = epochDay(2024, 3, 1) * MS_PER_DAY + 3_600_000 + 123;
    expect(epochFromPseudo('UTC', pseudo)).toBe(
      epochDay(2024, 3, 1) * MS_PER_DAY + 3_600_000 + 123
    );
  });

  // The two-candidate search: a DST-gap local time has no valid instant, so the
  // first candidate never validates and the second candidate decides the result.
  it('resolves a DST-gap local time forward', () => {
    // 2024-03-10T02:30 does not exist in New York; constrain resolves forward
    expect(epochFromLocal('America/New_York', 2024, 3, 10, 2, 30, 0)).toBe(
      Date.UTC(2024, 2, 10, 7, 30)
    );
  });

  it('resolves the instant immediately after a DST gap', () => {
    // 03:00 exists exactly once, at 07:00Z — the c2 candidate, not max(c1, c2)
    expect(epochFromLocal('America/New_York', 2024, 3, 10, 3, 0, 0)).toBe(
      Date.UTC(2024, 2, 10, 7, 0)
    );
  });

  it('resolves an ambiguous local time to its earlier occurrence, either side of UTC', () => {
    // 2024-11-03T01:30 happens twice in New York (05:30Z in EDT, 06:30Z in EST);
    // 2024-10-27T01:30 happens twice in London (00:30Z in BST, 01:30Z in GMT).
    // Disambiguation must not depend on the sign of the zone's offset.
    expect(epochFromLocal('America/New_York', 2024, 11, 3, 1, 30, 0)).toBe(
      Date.UTC(2024, 10, 3, 5, 30)
    );
    expect(epochFromLocal('Europe/London', 2024, 10, 27, 1, 30, 0)).toBe(
      Date.UTC(2024, 9, 27, 0, 30)
    );
  });
});
