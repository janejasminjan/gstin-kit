/**
 * Aggregation + tax-split helpers used by multiple builders.
 */

import { round2, roundInt } from './format';
import {
  B2BInvoice,
  B2CSAggregate,
  DocIssueGroup,
  DocSeries,
  HSNRow,
  ItemDet,
  SupplyType,
} from './types';

/** Compute IGST vs CGST/SGST split for a single line. */
export const computeTaxSplit = (
  txval: number,
  rt: number,
  interState: boolean,
  cessRate = 0
): Pick<ItemDet, 'iamt' | 'camt' | 'samt' | 'csamt'> => {
  const csamt = round2((txval * cessRate) / 100);
  if (interState) {
    return { iamt: round2((txval * rt) / 100), camt: 0, samt: 0, csamt };
  }
  const half = round2((txval * rt) / 200);
  return { iamt: 0, camt: half, samt: half, csamt };
};

/** Sum a list of {txval,iamt,camt,samt,csamt} into a single rounded total. */
export const sumTaxParts = (
  parts: Array<Partial<ItemDet>>
): ItemDet => {
  const acc = { txval: 0, rt: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
  for (const p of parts) {
    acc.txval += p.txval ?? 0;
    acc.iamt += p.iamt ?? 0;
    acc.camt += p.camt ?? 0;
    acc.samt += p.samt ?? 0;
    acc.csamt += p.csamt ?? 0;
  }
  acc.txval = round2(acc.txval);
  acc.iamt = round2(acc.iamt);
  acc.camt = round2(acc.camt);
  acc.samt = round2(acc.samt);
  acc.csamt = round2(acc.csamt);
  return acc;
};

/** Standard invoice total: integer-rounded sum of taxable + all tax. */
export const computeVal = (it: Omit<ItemDet, 'rt'>): number =>
  roundInt(it.txval + it.iamt + it.camt + it.samt + it.csamt);

/** Aggregate B2CS lines by (sply_ty, rt, pos). */
export const aggregateB2CS = (
  lines: Array<{
    sply_ty: SupplyType;
    rt: number;
    pos: string;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
    typ?: 'OE' | 'E';
  }>
): B2CSAggregate[] => {
  const map = new Map<string, B2CSAggregate>();
  for (const l of lines) {
    const typ = l.typ ?? 'OE';
    const key = `${l.sply_ty}|${l.rt}|${l.pos}|${typ}`;
    const cur = map.get(key);
    if (cur) {
      cur.txval = round2(cur.txval + l.txval);
      cur.iamt = round2(cur.iamt + l.iamt);
      cur.camt = round2(cur.camt + l.camt);
      cur.samt = round2(cur.samt + l.samt);
      cur.csamt = round2(cur.csamt + l.csamt);
    } else {
      map.set(key, {
        sply_ty: l.sply_ty,
        rt: l.rt,
        typ,
        pos: l.pos,
        txval: round2(l.txval),
        iamt: round2(l.iamt),
        camt: round2(l.camt),
        samt: round2(l.samt),
        csamt: round2(l.csamt),
      });
    }
  }
  return Array.from(map.values());
};

export interface HSNLine {
  hsn_sc: string;
  desc?: string;
  uqc: string;
  qty: number;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

/** Group HSN lines by (hsn_sc, uqc, rt). */
export const aggregateHSN = (lines: HSNLine[]): HSNRow[] => {
  const map = new Map<string, HSNRow>();
  for (const l of lines) {
    const key = `${l.hsn_sc}|${l.uqc}|${l.rt}`;
    const cur = map.get(key);
    if (cur) {
      cur.qty = round2(cur.qty + l.qty);
      cur.txval = round2(cur.txval + l.txval);
      cur.iamt = round2(cur.iamt + l.iamt);
      cur.camt = round2(cur.camt + l.camt);
      cur.samt = round2(cur.samt + l.samt);
      cur.csamt = round2(cur.csamt + l.csamt);
    } else {
      map.set(key, {
        num: 0,
        hsn_sc: l.hsn_sc,
        desc: l.desc,
        uqc: l.uqc,
        qty: round2(l.qty),
        rt: l.rt,
        txval: round2(l.txval),
        iamt: round2(l.iamt),
        camt: round2(l.camt),
        samt: round2(l.samt),
        csamt: round2(l.csamt),
      });
    }
  }
  return Array.from(map.values()).map((r, i) => ({ ...r, num: i + 1 }));
};

export interface DocSeriesInput {
  doc_num: number;
  doc_typ: string;
  from: string;
  to: string;
  totnum: number;
  cancel: number;
}

/** Group document series by doc_num, computing net_issue. */
export const buildDocIssue = (rows: DocSeriesInput[]): DocIssueGroup[] => {
  const map = new Map<number, DocIssueGroup>();
  for (const [idx, r] of rows.entries()) {
    const ser: DocSeries = {
      num: idx + 1,
      from: r.from,
      to: r.to,
      totnum: r.totnum,
      cancel: r.cancel,
      net_issue: r.totnum - r.cancel,
    };
    const cur = map.get(r.doc_num);
    if (cur) cur.docs.push(ser);
    else map.set(r.doc_num, { doc_num: r.doc_num, doc_typ: r.doc_typ, docs: [ser] });
  }
  return Array.from(map.values()).sort((a, b) => a.doc_num - b.doc_num);
};

export const DOC_TYPE_BY_NUM: Record<number, string> = {
  1: 'Invoices for outward supply',
  2: 'Invoices for inward supply from unregistered person',
  3: 'Revised Invoice',
  4: 'Debit Note',
  5: 'Credit Note',
  6: 'Receipt voucher',
  7: 'Payment Voucher',
  8: 'Refund Voucher',
  9: 'Delivery Challan for job work',
  10: 'Delivery Challan for supply on approval',
  11: 'Delivery Challan in case of liquid gas',
  12: 'Delivery Challan in cases other than by way of supply',
  13: 'Bill of Supply',
};

export const UQC_NORMALISE = (u: string | null | undefined): string => {
  if (!u) return 'NOS';
  const v = u.trim().toUpperCase();
  const map: Record<string, string> = {
    PCS: 'NOS', PC: 'NOS', NO: 'NOS', NOS: 'NOS',
    KG: 'KGS', KGS: 'KGS',
    M: 'MTR', MTR: 'MTR', METER: 'MTR',
    L: 'LTR', LTR: 'LTR', LITRE: 'LTR',
    UNT: 'UNT', UNIT: 'UNT',
    BOX: 'BOX',
    PAC: 'PAC', PACK: 'PAC', PKT: 'PAC',
    SET: 'SET', DOZ: 'DOZ', TON: 'TON',
  };
  return map[v] ?? (v.length === 3 ? v : 'NOS');
};

/** Unused export to silence lint when ItemDet only used as a type-arg. */
export type _ItemDet = ItemDet;
/** Unused export to silence lint when B2BInvoice only used as a type-arg. */
export type _B2BInvoice = B2BInvoice;
