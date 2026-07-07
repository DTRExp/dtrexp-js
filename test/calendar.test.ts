import {
  addMonthsConstrain,
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

  it('resolves DST-gap local times forward and repeated ones to the later pass', () => {
    expect(epochFromLocal('Europe/Berlin', 2026, 3, 29, 2, 30, 0)).toBe(
      Date.UTC(2026, 2, 29, 1, 30)
    );
    expect(epochFromLocal('Europe/Berlin', 2026, 10, 25, 2, 30, 0)).toBe(
      Date.UTC(2026, 9, 25, 1, 30)
    );
  });
});
