/**
 * Formatting + numeric helpers for GST portal JSON (schema GST3.2.2).
 * All money is JSON `number` with at most 2dp; `val` is rounded integer.
 */

export const GST_SCHEMA_VERSION = 'GST3.2.2';
export const GST_HASH_PLACEHOLDER = 'hash';

/** Round to 2 decimal places, return as Number (e.g. 28880.3 / 28880.23). */
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/** Round to nearest integer (used for invoice / note `val`). */
export const roundInt = (n: number): number => Math.round(n);

/** Format any date-ish value to `DD-MM-YYYY`. */
export const ddmmyyyy = (d: Date | string): string => {
  const dt = d instanceof Date ? d : new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${dt.getFullYear()}`;
};

/** Filing period `MMYYYY`. */
export const mmyyyy = (year: number, month1to12: number): string =>
  `${String(month1to12).padStart(2, '0')}${year}`;

/** Financial year string like "2025-26" from a date. */
export const fyString = (d: Date | string): string => {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const start = dt.getMonth() + 1 >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

/** Two-digit state code with leading zero. */
export const padState = (s: string | number | null | undefined): string => {
  if (s === null || s === undefined || s === '') return '';
  return String(s).padStart(2, '0').slice(-2);
};

/**
 * Lookup table: lower-cased state name → 2-digit GST state code.
 * Covers common spelling variants ("Jammu and Kashmir" / "Jammu & Kashmir",
 * "Andaman and Nicobar Islands" / "Andaman & Nicobar Islands", etc.) so the
 * upstream invoice data — which historically stored the state name in
 * `place_of_supply` — resolves cleanly to the portal's 2-digit code.
 */
const STATE_NAME_TO_CODE: Record<string, string> = {
  'jammu & kashmir': '01', 'jammu and kashmir': '01', 'j&k': '01',
  'himachal pradesh': '02',
  'punjab': '03',
  'chandigarh': '04',
  'uttarakhand': '05', 'uttaranchal': '05',
  'haryana': '06',
  'delhi': '07', 'new delhi': '07',
  'rajasthan': '08',
  'uttar pradesh': '09', 'up': '09',
  'bihar': '10',
  'sikkim': '11',
  'arunachal pradesh': '12',
  'nagaland': '13',
  'manipur': '14',
  'mizoram': '15',
  'tripura': '16',
  'meghalaya': '17',
  'assam': '18',
  'west bengal': '19',
  'jharkhand': '20',
  'odisha': '21', 'orissa': '21',
  'chhattisgarh': '22', 'chattisgarh': '22',
  'madhya pradesh': '23',
  'gujarat': '24',
  'daman & diu': '25', 'daman and diu': '25',
  'dadra & nagar haveli': '26', 'dadra and nagar haveli': '26',
  'maharashtra': '27',
  'andhra pradesh (old)': '28',
  'karnataka': '29',
  'goa': '30',
  'lakshadweep': '31',
  'kerala': '32',
  'tamil nadu': '33', 'tamilnadu': '33',
  'puducherry': '34', 'pondicherry': '34',
  'andaman & nicobar islands': '35', 'andaman and nicobar islands': '35', 'andaman & nicobar': '35',
  'telangana': '36',
  'andhra pradesh (new)': '37', 'andhra pradesh': '37',
  'ladakh': '38',
  'other territory': '97',
  'foreign country': '96',
  'centre': '99', 'centre jurisdiction': '99',
};

/**
 * Coerce a free-form place-of-supply value (state name, 2-digit code with or
 * without leading zero, or numeric) into the portal-required 2-digit state
 * code. Returns empty string when the value cannot be resolved.
 */
export const resolveStateCode = (
  s: string | number | null | undefined,
): string => {
  if (s === null || s === undefined || s === '') return '';
  const raw = String(s).trim();
  if (!raw) return '';
  if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, '0');
  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  return STATE_NAME_TO_CODE[key] ?? '';
};


/** Allowed GST rates per portal schema. */
export const ALLOWED_GST_RATES = [
  0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28,
] as const;

/** Allowed Indian state codes (incl. 97 Other Territory, 96 Foreign Country, 99 Centre). */
export const ALLOWED_STATE_CODES = new Set(
  [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 96, 97,
    99,
  ].map(n => String(n).padStart(2, '0'))
);
