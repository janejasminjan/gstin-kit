export type SupplyType = 'intraState'|'interState'|'exportWithIgst'|'exportWithoutIgst'|'sezWithIgst'|'sezWithoutIgst';
export type RoundingStrategy = 'money2'|'nearestRupee'|'none';
export interface SupplyContext { supplierState: string; placeOfSupply?: string|null; buyerCountry?: string; sez?: boolean; lut?: boolean; payIgst?: boolean; }
export interface GstCalculation { supplyType: SupplyType; taxableValue: number; gstRate: number; cessRate: number; cgstRate: number; sgstRate: number; igstRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number; cessAmount: number; totalTax: number; }
export function roundMoney(value: number, decimals = 2): number { if (!Number.isFinite(value)) return 0; const f=10**decimals; return Math.sign(value)*Math.round(Math.abs(value)*f)/f; }
export function roundToRupee(value: number): number { return Math.sign(value)*Math.round(Math.abs(value)); }
export function applyRounding(value: number, strategy: RoundingStrategy='money2'): number { return strategy==='none' ? value : strategy==='nearestRupee' ? roundToRupee(value) : roundMoney(value); }
const state = (v: string|null|undefined) => String(v ?? '').padStart(2,'0').slice(-2);
export function classifySupply(input: SupplyContext): SupplyType {
  if ((input.buyerCountry ?? 'IN').toUpperCase() !== 'IN') return input.payIgst && !input.lut ? 'exportWithIgst' : 'exportWithoutIgst';
  if (input.sez) return input.payIgst && !input.lut ? 'sezWithIgst' : 'sezWithoutIgst';
  return input.placeOfSupply && state(input.supplierState)!==state(input.placeOfSupply) ? 'interState' : 'intraState';
}
export function calculateGst(input: { taxableValue:number; rate:number; cessRate?:number; supplyType:SupplyType; rounding?:RoundingStrategy }): GstCalculation {
  const {taxableValue,rate,supplyType}=input; const cessRate=input.cessRate ?? 0; const rounding=input.rounding ?? 'money2';
  const intra=supplyType==='intraState'; const igst=supplyType==='interState'||supplyType==='exportWithIgst'||supplyType==='sezWithIgst';
  const totalGst=applyRounding(taxableValue*rate/100,rounding); const cgstAmount=intra?applyRounding(totalGst/2,rounding):0; const sgstAmount=intra?applyRounding(totalGst-cgstAmount,rounding):0; const igstAmount=igst?totalGst:0; const cessAmount=applyRounding(taxableValue*cessRate/100,rounding);
  return {supplyType,taxableValue,gstRate:rate,cessRate,cgstRate:intra?rate/2:0,sgstRate:intra?rate/2:0,igstRate:igst?rate:0,cgstAmount,sgstAmount,igstAmount,cessAmount,totalTax:applyRounding(cgstAmount+sgstAmount+igstAmount+cessAmount,rounding)};
}
export interface TaxAuditIssue { field:'igstAmount'|'cgstAmount'|'sgstAmount'|'cessAmount'|'mixedTax'; expected:number; actual:number; difference:number; message:string; }
export function auditTaxLine(input:{taxableValue:number;rate:number;cessRate?:number;supplyType:SupplyType;actual:Pick<GstCalculation,'cgstAmount'|'sgstAmount'|'igstAmount'|'cessAmount'>;tolerance?:number}):TaxAuditIssue[]{
 const expected=calculateGst(input); const issues:TaxAuditIssue[]=[]; const tolerance=input.tolerance??1;
 for(const field of ['igstAmount','cgstAmount','sgstAmount','cessAmount'] as const){const difference=roundMoney(input.actual[field]-expected[field]);if(Math.abs(difference)>tolerance)issues.push({field,expected:expected[field],actual:input.actual[field],difference,message:`${field} differs by ${difference}.`});}
 if(input.actual.igstAmount>0&&(input.actual.cgstAmount>0||input.actual.sgstAmount>0))issues.push({field:'mixedTax',expected:0,actual:1,difference:1,message:'IGST and CGST/SGST cannot both be non-zero on one line.'}); return issues;
}
