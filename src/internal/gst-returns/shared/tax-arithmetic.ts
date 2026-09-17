/**
 * Pure GST tax arithmetic helpers used by the live tax checker and the
 * validation engine. All amounts in rupees; tolerances are ₹1 unless stated.
 */

export interface TaxBreakup {
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface TaxComputeInput {
  txval: number;
  rt: number;          // GST rate in percent (e.g. 18)
  cessRate?: number;   // optional cess rate in percent
  isInterState: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTax({ txval, rt, cessRate = 0, isInterState }: TaxComputeInput): TaxBreakup {
  const total = r2(txval * rt / 100);
  const csamt = r2(txval * cessRate / 100);
  if (isInterState) return { iamt: total, camt: 0, samt: 0, csamt };
  const half = r2(txval * rt / 200);
  // Make sure halves add to total (rounding adjustment on samt).
  return { iamt: 0, camt: half, samt: r2(total - half), csamt };
}

export function computeInvoiceValue(txval: number, t: TaxBreakup): number {
  return Math.round(txval + t.iamt + t.camt + t.samt + t.csamt);
}

export interface ArithmeticIssue {
  level: 'error' | 'warning';
  field: 'iamt' | 'camt' | 'samt' | 'csamt' | 'val' | 'mix';
  message: string;
  expected: number;
  entered: number;
  diff: number;
}

const TOL = 1; // ±₹1 tolerance

export function auditTaxLine(opts: {
  txval: number;
  rt: number;
  cessRate?: number;
  isInterState: boolean;
  entered: TaxBreakup;
  enteredVal?: number;
}): ArithmeticIssue[] {
  const out: ArithmeticIssue[] = [];
  const expected = computeTax(opts);

  const cmp = (field: ArithmeticIssue['field'], exp: number, ent: number) => {
    const diff = r2(ent - exp);
    if (Math.abs(diff) > TOL) {
      out.push({
        level: 'error',
        field,
        message: `${field.toUpperCase()} mismatch: expected ${exp.toFixed(2)}, entered ${ent.toFixed(2)} (diff ${diff.toFixed(2)})`,
        expected: exp,
        entered: ent,
        diff,
      });
    }
  };
  cmp('iamt', expected.iamt, opts.entered.iamt);
  cmp('camt', expected.camt, opts.entered.camt);
  cmp('samt', expected.samt, opts.entered.samt);
  cmp('csamt', expected.csamt, opts.entered.csamt);

  // Mixed intra+inter state combination
  const anyIgst = opts.entered.iamt > 0;
  const anyCgst = opts.entered.camt > 0 || opts.entered.samt > 0;
  if (anyIgst && anyCgst) {
    out.push({
      level: 'error',
      field: 'mix',
      message: 'Both IGST and CGST/SGST are non-zero on the same line. Use one or the other based on place of supply.',
      expected: 0, entered: 0, diff: 0,
    });
  }

  // txval=0 with non-zero tax (and vice-versa)
  const totalTax = opts.entered.iamt + opts.entered.camt + opts.entered.samt;
  if (opts.txval === 0 && totalTax > 0) {
    out.push({ level: 'error', field: 'mix', message: 'Tax is non-zero but taxable value is zero.', expected: 0, entered: totalTax, diff: totalTax });
  } else if (opts.txval > 0 && opts.rt > 0 && totalTax === 0) {
    out.push({ level: 'warning', field: 'mix', message: 'Taxable value & rate are non-zero but no tax entered.', expected: r2(opts.txval * opts.rt / 100), entered: 0, diff: 0 });
  }

  if (typeof opts.enteredVal === 'number') {
    const expVal = computeInvoiceValue(opts.txval, expected);
    const diff = r2(opts.enteredVal - expVal);
    if (Math.abs(diff) > 2) {
      out.push({
        level: 'warning',
        field: 'val',
        message: `Invoice value mismatch: expected ${expVal}, entered ${opts.enteredVal} (diff ${diff.toFixed(2)})`,
        expected: expVal,
        entered: opts.enteredVal,
        diff,
      });
    }
  }

  return out;
}

/** Detect inter-state from supplier vs buyer 2-digit state codes. */
export function isInterState(supplierState: string, posOrBuyerState: string | null | undefined): boolean {
  if (!posOrBuyerState) return false;
  const a = String(supplierState).padStart(2, '0').slice(-2);
  const b = String(posOrBuyerState).padStart(2, '0').slice(-2);
  return a !== b;
}
