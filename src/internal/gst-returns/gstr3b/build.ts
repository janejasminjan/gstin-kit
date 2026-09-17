/**
 * GSTR-3B — monthly self-assessment return.
 * Envelope uses `ret_period` (not `fp`). Late-fee block always emitted, even if zero.
 */

import { round2 } from '../shared/format';
import { buildRetPeriodEnvelope, RetPeriodEnvelope } from '../shared/envelope';
import { ValidationIssue } from '../shared/types';
import { isValidGstin, parseFilingPeriod } from '../shared/validate';

export interface OSupDet {
  txval: number; iamt: number; camt: number; samt: number; csamt: number;
}
export interface OSupZero { txval: number; iamt: number; csamt: number }
export interface OSupNilExmp { txval: number }
export interface OSupNonGst { txval: number }

export interface InwardSupplyRow {
  ty: 'GST' | 'NONGST';
  intra?: number;
  inter?: number;
  expt?: number;
  nil_expt?: number;
  ngsup?: number;
}

export interface ItcRow { ty: string; iamt: number; camt: number; samt: number; csamt: number }

export interface GSTR3BInput {
  gstin: string;
  ret_period: string; // MMYYYY
  quarterly?: boolean;
  sup_details: {
    osup_det: OSupDet;
    osup_zero: OSupZero;
    osup_nil_exmp: OSupNilExmp;
    isup_rev: OSupDet;
    osup_nongst: OSupNonGst;
  };
  inward_sup?: { isup_details: InwardSupplyRow[] };
  itc_elg?: {
    itc_avl: ItcRow[];
    itc_rev: ItcRow[];
    itc_net: { iamt: number; camt: number; samt: number; csamt: number };
    itc_inelg: ItcRow[];
  };
  intr_ltfee?: { intr_details: { iamt: number; camt: number; samt: number; csamt: number } };
}

export interface GSTR3BJson extends RetPeriodEnvelope {
  sup_details: GSTR3BInput['sup_details'];
  inward_sup?: GSTR3BInput['inward_sup'];
  itc_elg?: GSTR3BInput['itc_elg'];
  intr_ltfee: { intr_details: { iamt: number; camt: number; samt: number; csamt: number } };
}

const zeroITC = (): ItcRow[] => (
  ['IMPG', 'IMPS', 'ISRC', 'ISD', 'OTH'] as const
).map(ty => ({ ty, iamt: 0, camt: 0, samt: 0, csamt: 0 }));

const zeroRev = (): ItcRow[] => (
  ['RUL_37', 'RUL_39', 'RUL_42', 'RUL_43', 'RUL_44', 'MISCINTRA'] as const
).map(ty => ({ ty, iamt: 0, camt: 0, samt: 0, csamt: 0 }));

const zeroInelg = (): ItcRow[] => (
  ['RUL_04', 'OTHP'] as const
).map(ty => ({ ty, iamt: 0, camt: 0, samt: 0, csamt: 0 }));

const round2Row = <T extends object>(r: T): T => {
  const out: any = {};
  for (const [k, v] of Object.entries(r as any)) {
    out[k] = typeof v === 'number' ? round2(v) : v;
  }
  return out as T;
};

export function buildGSTR3B(input: GSTR3BInput): { json: GSTR3BJson; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!isValidGstin(input.gstin)) issues.push({ level: 'error', path: 'gstin', message: 'Invalid GSTIN' });
  if (!parseFilingPeriod(input.ret_period))
    issues.push({ level: 'error', path: 'ret_period', message: 'Invalid period (MMYYYY)' });

  const itc = input.itc_elg ?? {
    itc_avl: zeroITC(),
    itc_rev: zeroRev(),
    itc_net: { iamt: 0, camt: 0, samt: 0, csamt: 0 },
    itc_inelg: zeroInelg(),
  };

  return {
    json: {
      ...buildRetPeriodEnvelope(input.gstin, input.ret_period),
      sup_details: {
        osup_det: round2Row(input.sup_details.osup_det),
        osup_zero: round2Row(input.sup_details.osup_zero),
        osup_nil_exmp: round2Row(input.sup_details.osup_nil_exmp),
        isup_rev: round2Row(input.sup_details.isup_rev),
        osup_nongst: round2Row(input.sup_details.osup_nongst),
      },
      inward_sup: input.inward_sup,
      itc_elg: {
        itc_avl: itc.itc_avl.map(round2Row),
        itc_rev: itc.itc_rev.map(round2Row),
        itc_net: round2Row(itc.itc_net),
        itc_inelg: itc.itc_inelg.map(round2Row),
      },
      intr_ltfee: input.intr_ltfee ?? { intr_details: { iamt: 0, camt: 0, samt: 0, csamt: 0 } },
    },
    issues,
  };
}
