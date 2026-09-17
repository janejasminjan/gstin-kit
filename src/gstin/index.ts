export const gstinFormat = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const gstStateCodes: Readonly<Record<string, string>> = Object.freeze({
  '01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','26':'Dadra & Nagar Haveli and Daman & Diu','27':'Maharashtra','28':'Andhra Pradesh','29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar Islands','36':'Telangana','37':'Andhra Pradesh (New)','38':'Ladakh','97':'Other Territory','99':'Centre Jurisdiction'
});
export interface GstinValidation { valid: boolean; normalized: string; stateCode: string | null; stateName: string | null; errors: string[]; }
export function normalizeGstin(value: unknown): string { return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ''); }
export function getGstinStateCode(value: unknown): string | null { const v = normalizeGstin(value); return /^\d{2}/.test(v) ? v.slice(0,2) : null; }
export function validateGstin(value: unknown): GstinValidation {
  const normalized = normalizeGstin(value); const errors: string[] = [];
  if (!normalized) errors.push('GSTIN is required.');
  else if (!gstinFormat.test(normalized)) errors.push('GSTIN must match the 15-character structural format.');
  const stateCode = getGstinStateCode(normalized);
  if (stateCode && !(stateCode in gstStateCodes)) errors.push(`Unknown GST state code: ${stateCode}.`);
  return { valid: errors.length === 0, normalized, stateCode, stateName: stateCode ? gstStateCodes[stateCode] ?? null : null, errors };
}
export function isValidGstin(value: unknown): boolean { return validateGstin(value).valid; }
export function requireGstin(value: unknown, label = 'GSTIN'): string { const result = validateGstin(value); if (!result.valid) throw new Error(`${label} is invalid: ${result.errors.join(' ')}`); return result.normalized; }
