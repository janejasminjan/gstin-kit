/**
 * Common GST3.2.2 typings shared across all return builders.
 * Field names mirror the GST portal exactly — DO NOT rename.
 */

export type GSTIN = string; // 15-char [0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]
export type StateCode = string; // 2-digit "01".."38" / "96" / "97" / "99"
export type GstDate = string; // DD-MM-YYYY
export type FilingPeriod = string; // MMYYYY
export type FinancialYear = string; // YYYY-YY

export type InvoiceTypeCode = 'R' | 'SEWP' | 'SEWOP' | 'DE' | 'CBW';
export type NoteType = 'C' | 'D';
export type SupplyType = 'INTRA' | 'INTER';

export interface ItemDet {
  txval: number;
  rt: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface InvoiceItem {
  num: number;
  itm_det: ItemDet;
}

export interface B2BInvoice {
  inum: string;
  idt: GstDate;
  val: number;
  pos: StateCode;
  rchrg: 'Y' | 'N';
  inv_typ: InvoiceTypeCode;
  itms: InvoiceItem[];
  irn?: string; // optional e-invoice reference
}

export interface B2BGroup {
  ctin: GSTIN;
  inv: B2BInvoice[];
}

export interface B2CLInvoice {
  inum: string;
  idt: GstDate;
  val: number;
  itms: InvoiceItem[];
}

export interface B2CLGroup {
  pos: StateCode;
  inv: B2CLInvoice[];
}

export interface B2CSAggregate {
  sply_ty: SupplyType;
  rt: number;
  typ: 'OE' | 'E';
  pos: StateCode;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface CDNRNote {
  nt_num: string;
  nt_dt: GstDate;
  ntty: NoteType;
  val: number;
  pos: StateCode;
  rchrg: 'Y' | 'N';
  inv_typ: InvoiceTypeCode;
  itms: InvoiceItem[];
}

export interface CDNRGroup {
  ctin: GSTIN;
  nt: CDNRNote[];
}

export interface CDNURNote {
  typ: 'B2CL' | 'EXPWP' | 'EXPWOP';
  nt_num: string;
  nt_dt: GstDate;
  ntty: NoteType;
  val: number;
  pos?: StateCode; // mandatory for B2CL
  itms: InvoiceItem[];
}

export interface ExportInvoiceItem {
  txval: number;
  rt: number;
  iamt: number;
  csamt: number;
}

export interface ExportInvoice {
  inum: string;
  idt: GstDate;
  val: number;
  sbpcode?: string;
  sbnum?: string;
  sbdt?: GstDate;
  itms: ExportInvoiceItem[];
}

export interface ExportGroup {
  exp_typ: 'WPAY' | 'WOPAY';
  inv: ExportInvoice[];
}

export interface AdvanceTax {
  sply_ty: SupplyType;
  rt: number;
  pos: StateCode;
  ad_amt: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface DocSeries {
  num: number;
  from: string;
  to: string;
  totnum: number;
  cancel: number;
  net_issue: number;
}

export interface DocIssueGroup {
  doc_num: number;
  doc_typ: string;
  docs: DocSeries[];
}

export interface HSNRow {
  num: number;
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

export interface NilSupply {
  sply_ty: 'INTRB2B' | 'INTRB2C' | 'INTRAB2B' | 'INTRAB2C';
  expt_amt: number;
  nil_amt: number;
  ngsup_amt: number;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface BuildResult<T> {
  json: T;
  issues: ValidationIssue[];
}
