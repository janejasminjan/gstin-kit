/**
 * Strict JSON serialiser for GST portal upload.
 * - Recursively drops keys whose value is an empty array or empty object.
 * - Emits minified JSON by default (portal-ready); pretty mode for human review.
 * - UTF-8 string with no BOM (caller writes it as-is).
 */

import { GSTIN } from './types';

export interface SerializeOptions {
  pretty?: boolean;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const pruneEmpty = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const cleaned = value
      .map(pruneEmpty)
      .filter(v => v !== undefined);
    return cleaned;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = pruneEmpty(v);
      if (
        cleaned === undefined ||
        cleaned === null ||
        (Array.isArray(cleaned) && cleaned.length === 0) ||
        (isPlainObject(cleaned) && Object.keys(cleaned).length === 0)
      ) {
        continue;
      }
      out[k] = cleaned;
    }
    return out;
  }
  return value;
};

export const serializeGSTJson = (
  payload: unknown,
  opts: SerializeOptions = {}
): string => {
  const cleaned = pruneEmpty(payload);
  return opts.pretty
    ? JSON.stringify(cleaned, null, 2)
    : JSON.stringify(cleaned);
};

export type ReturnTypeId =
  | 'GSTR1'
  | 'GSTR1A'
  | 'GSTR2B'
  | 'GSTR3B'
  | 'GSTR4'
  | 'GSTR6'
  | 'GSTR7'
  | 'GSTR8'
  | 'GSTR9'
  | 'GSTR9C'
  | 'IFF';

/** Filename per portal convention: {GSTIN}_{ReturnType}_{Period}.json */
export const buildReturnFilename = (
  gstin: GSTIN,
  ret: ReturnTypeId,
  period: string
): string => `${gstin}_${ret}_${period}.json`;

/** Browser download helper. No-op server-side. */
export const downloadJsonFile = (json: string, filename: string): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
