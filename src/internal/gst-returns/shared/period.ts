/**
 * Shared period / quarter utilities used by every GST return builder.
 *
 * Goals:
 *   - One canonical implementation of "is this DD-MM-YYYY date inside the
 *     monthly or quarterly filing period?".
 *   - One canonical error message format so GSTR-1, IFF, 1A, 3B, 6, 7, 8
 *     all surface identical errors and the UI can rely on them being blocking.
 *   - One canonical month-range mapping for QRMP quarters (including the
 *     Indian FY Q4 = Jan–Mar same-calendar-year convention).
 */

import { isDdMmYyyy, parseFilingPeriod } from './validate';
import { ValidationIssue } from './types';

export interface PeriodMonth {
  /** 1..12 */
  m: number;
  y: number;
  /** MMYYYY */
  mmyyyy: string;
  /** "April 2025" */
  label: string;
}

/**
 * Indian FY string for a (month, year) pair, e.g. (3, 2025) → "2024-25",
 * (4, 2025) → "2025-26".
 */
export const fyForMonth = (m: number, y: number): string => {
  const startYear = m >= 4 ? y : y - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
};

/**
 * For QRMP, GST treats quarters as ending in Jun / Sep / Dec / Mar.
 * fp=062025 → Apr–Jun 2025
 * fp=092025 → Jul–Sep 2025
 * fp=122025 → Oct–Dec 2025
 * fp=032025 → Jan–Mar 2025 (Q4 of FY 2024-25 — no calendar year wrap;
 *             the FY label is what wraps, not the calendar months).
 *
 * Returns the 3 months in chronological order or null if fp is invalid /
 * not a quarter-end.
 */
export const quarterMonthsFromFp = (fp: string): PeriodMonth[] | null => {
  const p = parseFilingPeriod(fp);
  if (!p) return null;
  if (![3, 6, 9, 12].includes(p.month)) return null;
  const endMonth = p.month;
  const startMonth = endMonth - 2; // always positive (>=1) for 3/6/9/12
  const months: PeriodMonth[] = [];
  for (let m = startMonth; m <= endMonth; m++) {
    months.push({
      m,
      y: p.year,
      mmyyyy: `${String(m).padStart(2, '0')}${p.year}`,
      label: new Date(p.year, m - 1, 1).toLocaleString('en-IN', {
        month: 'long',
        year: 'numeric',
      }),
    });
  }
  return months;
};

/** Human-readable "Apr 2025 – Jun 2025 (FY 2025-26 Q1)". */
export const quarterRangeLabel = (fp: string): string | null => {
  const months = quarterMonthsFromFp(fp);
  if (!months) return null;
  const first = months[0];
  const last = months[months.length - 1];
  const fy = fyForMonth(last.m, last.y);
  const qIndex = { 6: 1, 9: 2, 12: 3, 3: 4 }[last.m] ?? 0;
  const fmt = (pm: PeriodMonth) =>
    new Date(pm.y, pm.m - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  return `${fmt(first)} – ${fmt(last)} (FY ${fy} Q${qIndex})`;
};

/** Check DD-MM-YYYY falls inside MMYYYY (monthly). */
export const isInMonthlyPeriod = (idt: string, fp: string): boolean => {
  const p = parseFilingPeriod(fp);
  if (!p || !isDdMmYyyy(idt)) return false;
  const [dd, mm, yyyy] = idt.split('-').map(Number);
  return mm === p.month && yyyy === p.year && dd >= 1 && dd <= 31;
};

/** Check DD-MM-YYYY falls inside the quarter ending at MMYYYY. */
export const isInQuarterlyPeriod = (idt: string, fp: string): boolean => {
  const months = quarterMonthsFromFp(fp);
  if (!months || !isDdMmYyyy(idt)) return false;
  const [dd, mm, yyyy] = idt.split('-').map(Number);
  if (dd < 1 || dd > 31) return false;
  return months.some(pm => pm.m === mm && pm.y === yyyy);
};

export interface PeriodCheckOptions {
  quarterly?: boolean;
  /** Override severity. Default: 'error' so downloads are blocked. */
  level?: ValidationIssue['level'];
}

export interface PeriodChecker {
  /** Returns the same ValidationIssue shape every builder uses, or null when in range. */
  check: (idt: string, path: string, kind?: string) => ValidationIssue | null;
  /** The 3 quarter months when quarterly, or null when monthly. */
  months: PeriodMonth[] | null;
  quarterly: boolean;
  fp: string;
  /** Pre-built label like "filing period 052025" or "quarter Apr–Jun 2025 (062025)". */
  periodLabel: string;
}

/**
 * One factory for every builder. Use the returned `check()` so the error
 * message is byte-identical across GSTR-1/IFF/1A/3B/6/7/8 and the UI's
 * "block download" gate behaves consistently.
 */
export const makePeriodChecker = (
  fp: string,
  opts: PeriodCheckOptions = {},
): PeriodChecker => {
  const quarterly = !!opts.quarterly;
  const level = opts.level ?? 'error';
  const months = quarterly ? quarterMonthsFromFp(fp) : null;
  const periodLabel = quarterly
    ? `quarter ${quarterRangeLabel(fp) ?? fp} (${fp})`
    : `filing period ${fp}`;

  const inRange = (idt: string) =>
    quarterly ? isInQuarterlyPeriod(idt, fp) : isInMonthlyPeriod(idt, fp);

  return {
    quarterly,
    fp,
    months,
    periodLabel,
    check(idt, path, kind = 'Date') {
      if (!isDdMmYyyy(idt)) {
        return {
          level,
          path,
          message: `${kind} ${idt} is not a valid DD-MM-YYYY date for ${periodLabel}`,
        };
      }
      if (!inRange(idt)) {
        return {
          level,
          path,
          message: `${kind} ${idt} not in ${periodLabel}`,
        };
      }
      return null;
    },
  };
};
