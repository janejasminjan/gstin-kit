/**
 * GSTR-1 builder — outward supplies (monthly/quarterly).
 * Output matches the canonical GST3.2.2 envelope:
 *   { gstin, fp, version, hash, b2b?, b2cl?, b2cs?, cdnr?, cdnur?, exp?, at?, atadj?, nil?, doc_issue?, hsn? }
 * Empty sections are dropped by serializeGSTJson() at export time.
 */

import { ddmmyyyy, padState, resolveStateCode, round2, roundInt } from '../shared/format';
import {
  aggregateB2CS,
  aggregateHSN,
  buildDocIssue,
  computeTaxSplit,
  computeVal,
  DOC_TYPE_BY_NUM,
  DocSeriesInput,
  HSNLine,
  UQC_NORMALISE,
} from '../shared/aggregators';
import { buildPeriodEnvelope, PeriodEnvelope } from '../shared/envelope';
import {
  B2BGroup,
  B2BInvoice,
  B2CLGroup,
  B2CLInvoice,
  B2CSAggregate,
  CDNRGroup,
  CDNRNote,
  CDNURNote,
  ExportGroup,
  ExportInvoice,
  HSNRow,
  InvoiceItem,
  InvoiceTypeCode,
  NilSupply,
  NoteType,
  AdvanceTax,
  DocIssueGroup,
  ValidationIssue,
} from '../shared/types';
import {
  checkInvoiceArithmetic,
  isAllowedRate,
  isDdMmYyyy,
  isValidGstin,
  isValidHsn,
  isValidStateCode,
  parseFilingPeriod,
  stateFromGstin,
} from '../shared/validate';
import { makePeriodChecker } from '../shared/period';

// ---------------- Input shape (the app's normalised invoice data) ----------------

export interface GSTR1InvoiceLine {
  hsn: string;
  uqc?: string;
  qty: number;
  rt: number;
  txval: number;
  cessRate?: number;
}

export interface GSTR1Invoice {
  inum: string;
  idt: string | Date;
  customerGstin?: string | null;
  customerStateCode?: string | null;
  customerName?: string;
  placeOfSupply?: string | null;
  reverseCharge?: boolean;
  invoiceType?: InvoiceTypeCode;
  export?: { exp_typ: 'WPAY' | 'WOPAY'; sbpcode?: string; sbnum?: string; sbdt?: string | Date };
  irn?: string;
  cancelled?: boolean;
  lines: GSTR1InvoiceLine[];
}

export interface GSTR1CreditDebitNote {
  ntNum: string;
  ntDt: string | Date;
  ntty: NoteType;
  customerGstin?: string | null;
  customerStateCode?: string | null;
  placeOfSupply?: string | null;
  reverseCharge?: boolean;
  invoiceType?: InvoiceTypeCode;
  /** For CDNUR only — original invoice category. */
  unregisteredType?: 'B2CL' | 'EXPWP' | 'EXPWOP';
  lines: GSTR1InvoiceLine[];
}

export interface GSTR1Advance {
  pos: string;
  rt: number;
  amount: number; // gross advance received (incl. tax)
  cessRate?: number;
}

export interface GSTR1NilLine {
  sply_ty: NilSupply['sply_ty'];
  expt_amt?: number;
  nil_amt?: number;
  ngsup_amt?: number;
}

export interface GSTR1DocSeriesRow extends DocSeriesInput {}

export interface GSTR1Input {
  gstin: string;
  /** Filing period MMYYYY, e.g. "042026". */
  fp: string;
  /** Supplier state code; defaults to first 2 chars of gstin. */
  supplierStateCode?: string;
  invoices: GSTR1Invoice[];
  notes?: GSTR1CreditDebitNote[];
  advances?: GSTR1Advance[];
  advanceAdjustments?: GSTR1Advance[];
  nilSupplies?: GSTR1NilLine[];
  docIssue?: GSTR1DocSeriesRow[];
  /** When true, treat fp as the end-month of a QRMP quarter; accept invoice dates from all 3 months. */
  quarterly?: boolean;
}

// ---------------- Output JSON ----------------

export interface GSTR1Json extends PeriodEnvelope {
  b2b?: B2BGroup[];
  b2cl?: B2CLGroup[];
  b2cs?: B2CSAggregate[];
  cdnr?: CDNRGroup[];
  cdnur?: CDNURNote[];
  exp?: ExportGroup[];
  at?: AdvanceTax[];
  atadj?: AdvanceTax[];
  nil?: { inv: NilSupply[] };
  doc_issue?: { doc_det: DocIssueGroup[] };
  hsn?: { hsn_b2b?: HSNRow[]; hsn_b2c?: HSNRow[] };
}

export interface GSTR1BuildResult {
  json: GSTR1Json;
  issues: ValidationIssue[];
}

// ---------------- Build ----------------

const B2CL_THRESHOLD = 250000;

const lineToItem = (
  num: number,
  line: GSTR1InvoiceLine,
  interState: boolean
): InvoiceItem => {
  const split = computeTaxSplit(line.txval, line.rt, interState, line.cessRate ?? 0);
  return {
    num,
    itm_det: {
      txval: round2(line.txval),
      rt: line.rt,
      iamt: split.iamt,
      camt: split.camt,
      samt: split.samt,
      csamt: split.csamt,
    },
  };
};

const isExport = (inv: GSTR1Invoice): boolean => !!inv.export;

export function buildGSTR1(input: GSTR1Input): GSTR1BuildResult {
  const issues: ValidationIssue[] = [];
  const gstin = input.gstin;
  const fp = input.fp;
  const supplierState = resolveStateCode(input.supplierStateCode ?? stateFromGstin(gstin)) || padState(input.supplierStateCode ?? stateFromGstin(gstin));

  if (!isValidGstin(gstin)) {
    issues.push({ level: 'error', path: 'gstin', message: `Invalid GSTIN: ${gstin}` });
  }
  if (!parseFilingPeriod(fp)) {
    issues.push({ level: 'error', path: 'fp', message: `Invalid filing period (MMYYYY): ${fp}` });
  }

  const periodChecker = makePeriodChecker(fp, { quarterly: input.quarterly });

  const active = input.invoices.filter(i => !i.cancelled);

  // -------- B2B / B2CL / B2CS / EXP split --------
  const b2bMap = new Map<string, B2BInvoice[]>();
  const b2clMap = new Map<string, B2CLInvoice[]>();
  const b2csLines: Parameters<typeof aggregateB2CS>[0] = [];
  const expMap = new Map<'WPAY' | 'WOPAY', ExportInvoice[]>();
  const hsnB2B: HSNLine[] = [];
  const hsnB2C: HSNLine[] = [];

  for (const inv of active) {
    const idt = ddmmyyyy(inv.idt);
    const dateIssue = periodChecker.check(idt, `inv[${inv.inum}].idt`, 'Invoice date');
    if (dateIssue) issues.push(dateIssue);

    // Export
    if (isExport(inv)) {
      const expTyp = inv.export!.exp_typ;
      const items = inv.lines.map((l, i) => {
        const csamt = round2((l.txval * (l.cessRate ?? 0)) / 100);
        const iamt = expTyp === 'WPAY' ? round2((l.txval * l.rt) / 100) : 0;
        return {
          txval: round2(l.txval),
          rt: l.rt,
          iamt,
          csamt,
          _hsn: { hsn: l.hsn, uqc: l.uqc, qty: l.qty },
        };
      });
      const txSum = items.reduce((a, x) => a + x.txval, 0);
      const tax = items.reduce((a, x) => a + x.iamt + x.csamt, 0);
      const expInv: ExportInvoice = {
        inum: inv.inum,
        idt,
        val: roundInt(txSum + tax),
        sbpcode: inv.export!.sbpcode,
        sbnum: inv.export!.sbnum,
        sbdt: inv.export!.sbdt ? ddmmyyyy(inv.export!.sbdt) : undefined,
        itms: items.map(x => ({ txval: x.txval, rt: x.rt, iamt: x.iamt, csamt: x.csamt })),
      };
      if (!expMap.has(expTyp)) expMap.set(expTyp, []);
      expMap.get(expTyp)!.push(expInv);

      for (const l of inv.lines) {
        hsnB2B.push({
          hsn_sc: l.hsn,
          uqc: UQC_NORMALISE(l.uqc),
          qty: l.qty,
          rt: l.rt,
          txval: l.txval,
          iamt: expTyp === 'WPAY' ? round2((l.txval * l.rt) / 100) : 0,
          camt: 0,
          samt: 0,
          csamt: round2((l.txval * (l.cessRate ?? 0)) / 100),
        });
      }
      continue;
    }

    const pos = resolveStateCode(inv.placeOfSupply ?? inv.customerStateCode ?? supplierState) || supplierState;
    if (!isValidStateCode(pos)) {
      issues.push({
        level: 'error',
        path: `inv[${inv.inum}].pos`,
        message: `Invalid place-of-supply code: ${pos}`,
      });
    }
    const interState = pos !== supplierState;

    const items: InvoiceItem[] = inv.lines.map((l, i) => {
      if (!isAllowedRate(l.rt)) {
        issues.push({
          level: 'error',
          path: `inv[${inv.inum}].itms[${i + 1}].rt`,
          message: `GST rate ${l.rt} is not in allowed set`,
        });
      }
      if (!isValidHsn(l.hsn)) {
        issues.push({
          level: 'warning',
          path: `inv[${inv.inum}].itms[${i + 1}].hsn`,
          message: `HSN ${l.hsn} should be 4/6/8 digits`,
        });
      }
      return lineToItem(i + 1, l, interState);
    });

    const totals = items.reduce(
      (a, it) => ({
        txval: a.txval + it.itm_det.txval,
        iamt: a.iamt + it.itm_det.iamt,
        camt: a.camt + it.itm_det.camt,
        samt: a.samt + it.itm_det.samt,
        csamt: a.csamt + it.itm_det.csamt,
      }),
      { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 }
    );
    const val = computeVal(totals);

    // HSN accumulation
    inv.lines.forEach((l, i) => {
      const split = computeTaxSplit(l.txval, l.rt, interState, l.cessRate ?? 0);
      const target = inv.customerGstin ? hsnB2B : hsnB2C;
      target.push({
        hsn_sc: l.hsn,
        uqc: UQC_NORMALISE(l.uqc),
        qty: l.qty,
        rt: l.rt,
        txval: l.txval,
        iamt: split.iamt,
        camt: split.camt,
        samt: split.samt,
        csamt: split.csamt,
      });
    });

    if (inv.customerGstin) {
      if (!isValidGstin(inv.customerGstin)) {
        issues.push({
          level: 'error',
          path: `inv[${inv.inum}].ctin`,
          message: `Invalid recipient GSTIN: ${inv.customerGstin}`,
        });
      }
      const b2bInv: B2BInvoice = {
        inum: inv.inum,
        idt,
        val,
        pos,
        rchrg: inv.reverseCharge ? 'Y' : 'N',
        inv_typ: inv.invoiceType ?? 'R',
        itms: items,
        irn: inv.irn,
      };
      if (!b2bMap.has(inv.customerGstin)) b2bMap.set(inv.customerGstin, []);
      b2bMap.get(inv.customerGstin)!.push(b2bInv);
    } else if (interState && val > B2CL_THRESHOLD) {
      // B2CL
      const b2clInv: B2CLInvoice = { inum: inv.inum, idt, val, itms: items };
      if (!b2clMap.has(pos)) b2clMap.set(pos, []);
      b2clMap.get(pos)!.push(b2clInv);
    } else {
      // B2CS — explode per rate
      for (const it of items) {
        b2csLines.push({
          sply_ty: interState ? 'INTER' : 'INTRA',
          rt: it.itm_det.rt,
          pos,
          txval: it.itm_det.txval,
          iamt: it.itm_det.iamt,
          camt: it.itm_det.camt,
          samt: it.itm_det.samt,
          csamt: it.itm_det.csamt,
        });
      }
    }
  }

  // Per-invoice arithmetic sanity for B2B groups
  for (const [ctin, invs] of b2bMap.entries()) {
    for (const i of invs) {
      const totals = i.itms.reduce(
        (a, it) => ({
          txval: a.txval + it.itm_det.txval,
          iamt: a.iamt + it.itm_det.iamt,
          camt: a.camt + it.itm_det.camt,
          samt: a.samt + it.itm_det.samt,
          csamt: a.csamt + it.itm_det.csamt,
        }),
        { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 }
      );
      issues.push(
        ...checkInvoiceArithmetic(
          `b2b[${ctin}].inv[${i.inum}]`,
          totals.txval,
          i.itms[0]?.itm_det.rt ?? 0,
          totals.iamt,
          totals.camt,
          totals.samt,
          totals.csamt,
          i.val
        ).filter(iss => iss.level === 'error')
      );
    }
  }

  // -------- CDNR / CDNUR --------
  const cdnrMap = new Map<string, CDNRNote[]>();
  const cdnur: CDNURNote[] = [];
  for (const n of input.notes ?? []) {
    const nt_dt = ddmmyyyy(n.ntDt);
    const noteDateIssue = periodChecker.check(nt_dt, `notes[${n.ntNum}].nt_dt`, 'Note date');
    if (noteDateIssue) issues.push(noteDateIssue);
    const pos = resolveStateCode(n.placeOfSupply ?? n.customerStateCode ?? supplierState) || supplierState;
    const interState = pos !== supplierState;
    const items: InvoiceItem[] = n.lines.map((l, i) => lineToItem(i + 1, l, interState));
    const totals = items.reduce(
      (a, it) => ({
        txval: a.txval + it.itm_det.txval,
        iamt: a.iamt + it.itm_det.iamt,
        camt: a.camt + it.itm_det.camt,
        samt: a.samt + it.itm_det.samt,
        csamt: a.csamt + it.itm_det.csamt,
      }),
      { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 }
    );
    const val = computeVal(totals);

    if (n.customerGstin) {
      const note: CDNRNote = {
        nt_num: n.ntNum,
        nt_dt,
        ntty: n.ntty,
        val,
        pos,
        rchrg: n.reverseCharge ? 'Y' : 'N',
        inv_typ: n.invoiceType ?? 'R',
        itms: items,
      };
      if (!cdnrMap.has(n.customerGstin)) cdnrMap.set(n.customerGstin, []);
      cdnrMap.get(n.customerGstin)!.push(note);
    } else {
      cdnur.push({
        typ: n.unregisteredType ?? 'B2CL',
        nt_num: n.ntNum,
        nt_dt,
        ntty: n.ntty,
        val,
        pos,
        itms: items,
      });
    }
  }

  // -------- Advances --------
  const buildAdv = (rows: GSTR1Advance[]): AdvanceTax[] =>
    rows.map(a => {
      const pos = resolveStateCode(a.pos) || padState(a.pos);
      const interState = pos !== supplierState;
      const denom = 1 + a.rt / 100;
      const txval = a.amount / denom;
      const split = computeTaxSplit(txval, a.rt, interState, a.cessRate ?? 0);
      return {
        sply_ty: interState ? 'INTER' : 'INTRA',
        rt: a.rt,
        pos,
        ad_amt: round2(txval),
        iamt: split.iamt,
        camt: split.camt,
        samt: split.samt,
        csamt: split.csamt,
      };
    });

  // -------- Assemble --------
  const json: GSTR1Json = {
    ...buildPeriodEnvelope(gstin, fp),
    b2b: Array.from(b2bMap.entries()).map(([ctin, inv]) => ({ ctin, inv })),
    b2cl: Array.from(b2clMap.entries()).map(([pos, inv]) => ({ pos, inv })),
    b2cs: aggregateB2CS(b2csLines),
    cdnr: Array.from(cdnrMap.entries()).map(([ctin, nt]) => ({ ctin, nt })),
    cdnur,
    exp: Array.from(expMap.entries()).map(([exp_typ, inv]) => ({ exp_typ, inv })),
    at: buildAdv(input.advances ?? []),
    atadj: buildAdv(input.advanceAdjustments ?? []),
    nil: input.nilSupplies?.length
      ? {
          inv: input.nilSupplies.map(n => ({
            sply_ty: n.sply_ty,
            expt_amt: round2(n.expt_amt ?? 0),
            nil_amt: round2(n.nil_amt ?? 0),
            ngsup_amt: round2(n.ngsup_amt ?? 0),
          })),
        }
      : undefined,
    doc_issue: input.docIssue?.length
      ? {
          doc_det: buildDocIssue(
            input.docIssue.map(d => ({ ...d, doc_typ: d.doc_typ || DOC_TYPE_BY_NUM[d.doc_num] || '' }))
          ),
        }
      : undefined,
    hsn:
      hsnB2B.length || hsnB2C.length
        ? {
            hsn_b2b: aggregateHSN(hsnB2B),
            hsn_b2c: aggregateHSN(hsnB2C),
          }
        : undefined,
  };

  return { json, issues };
}

/**
 * QRMP IFF (Invoice Furnishing Facility) — only B2B + CDNR; no B2CS / HSN / docs.
 */
export function buildIFF(input: GSTR1Input): GSTR1BuildResult {
  const full = buildGSTR1(input);
  const { b2b, cdnr, ...envOnly } = full.json;
  // IFF carries only B2B + CDNR (no B2CS/HSN/doc_issue).
  const { b2cs, b2cl, cdnur, exp, at, atadj, nil, doc_issue, hsn, ...env } = envOnly as any;
  return {
    json: { ...env, b2b, cdnr },
    issues: full.issues,
  };
}
