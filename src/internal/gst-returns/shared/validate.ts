/**
 * Validation primitives — every builder feeds JSON through these before export.
 * Returns ValidationIssue[]; the UI disables export when any `error` is present.
 */

import {
  ALLOWED_GST_RATES,
  ALLOWED_STATE_CODES,
  round2,
} from './format';
import { ValidationIssue } from './types';

export const GSTIN_REGEX =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const isValidGstin = (g: string | null | undefined): boolean =>
  !!g && GSTIN_REGEX.test(g);

export const stateFromGstin = (g: string): string => g.slice(0, 2);

export const isValidStateCode = (s: string | null | undefined): boolean =>
  !!s && ALLOWED_STATE_CODES.has(s);

export const isValidHsn = (h: string | null | undefined): boolean =>
  !!h && /^[0-9]+$/.test(h) && [4, 6, 8].includes(h.length);

export const isAllowedRate = (rt: number): boolean =>
  (ALLOWED_GST_RATES as readonly number[]).includes(rt);

export const isDdMmYyyy = (s: string): boolean =>
  /^([0-2][0-9]|3[01])-(0[1-9]|1[0-2])-\d{4}$/.test(s);

/** Filing period MMYYYY → {month, year} */
export const parseFilingPeriod = (
  fp: string
): { month: number; year: number } | null => {
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(fp)) return null;
  return { month: parseInt(fp.slice(0, 2), 10), year: parseInt(fp.slice(2), 10) };
};

/** Check DD-MM-YYYY falls inside the given MMYYYY period. */
export const dateInPeriod = (idt: string, fp: string): boolean => {
  const p = parseFilingPeriod(fp);
  if (!p || !isDdMmYyyy(idt)) return false;
  const [dd, mm, yyyy] = idt.split('-').map(Number);
  return mm === p.month && yyyy === p.year && dd >= 1 && dd <= 31;
};

/**
 * For QRMP / quarterly returns: check DD-MM-YYYY falls within the quarter
 * ENDING in the given MMYYYY period. Quarter end months are 06, 09, 12, 03.
 * e.g. fp=062025 → April, May, June 2025 are all in range.
 */
export const dateInQuarter = (idt: string, fp: string): boolean => {
  const p = parseFilingPeriod(fp);
  if (!p || !isDdMmYyyy(idt)) return false;
  const [dd, mm, yyyy] = idt.split('-').map(Number);
  // months in the quarter ending at p.month
  const endMonth = p.month;
  const startMonth = ((endMonth - 3 + 12) % 12) + 1; // 1..12, wraps Jan→Apr
  // If quarter spans a year boundary (Q4: Jan-Mar with end month 3),
  // start month (01) belongs to same calendar year (Jan-Mar). No wrap needed
  // for Indian QRMP because Q4 = Jan, Feb, Mar — all same year as end month.
  if (dd < 1 || dd > 31) return false;
  if (yyyy !== p.year) return false;
  return mm >= startMonth && mm <= endMonth;
};


/**
 * Reconcile item tax math: camt+samt+iamt+csamt should match the implied tax,
 * and val = round(txval + total tax).
 */
export const checkInvoiceArithmetic = (
  path: string,
  txval: number,
  rt: number,
  iamt: number,
  camt: number,
  samt: number,
  csamt: number,
  val?: number,
  tolerance = 1
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const computedTax = (txval * rt) / 100;
  const actualTax = iamt + camt + samt;
  if (Math.abs(actualTax - computedTax) > tolerance) {
    issues.push({
      level: 'warning',
      path,
      message: `Tax mismatch: expected ≈${round2(computedTax)}, got ${round2(actualTax)}`,
    });
  }
  if (iamt > 0 && (camt > 0 || samt > 0)) {
    issues.push({
      level: 'error',
      path,
      message: 'Cannot have IGST together with CGST/SGST',
    });
  }
  if (camt > 0 && samt > 0 && Math.abs(camt - samt) > 0.02) {
    issues.push({
      level: 'error',
      path,
      message: `CGST (${camt}) must equal SGST (${samt})`,
    });
  }
  if (val !== undefined) {
    const expectedVal = txval + iamt + camt + samt + csamt;
    if (Math.abs(val - expectedVal) > tolerance + 1) {
      issues.push({
        level: 'warning',
        path,
        message: `val ${val} does not reconcile with txval+tax (${round2(expectedVal)})`,
      });
    }
  }
  return issues;
};
