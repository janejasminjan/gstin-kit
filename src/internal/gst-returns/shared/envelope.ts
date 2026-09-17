/**
 * GST3.2.2 envelope helpers — every return wraps its payload with these.
 */

import { GST_HASH_PLACEHOLDER, GST_SCHEMA_VERSION } from './format';
import { FilingPeriod, FinancialYear, GSTIN } from './types';

export interface PeriodEnvelope {
  gstin: GSTIN;
  fp: FilingPeriod;
  version: string;
  hash: string;
}

export interface RetPeriodEnvelope {
  gstin: GSTIN;
  ret_period: FilingPeriod;
  version: string;
  hash: string;
}

export interface AnnualEnvelope {
  gstin: GSTIN;
  fy: FinancialYear;
  version: string;
  hash: string;
}

export const buildPeriodEnvelope = (
  gstin: GSTIN,
  fp: FilingPeriod
): PeriodEnvelope => ({
  gstin,
  fp,
  version: GST_SCHEMA_VERSION,
  hash: GST_HASH_PLACEHOLDER,
});

export const buildRetPeriodEnvelope = (
  gstin: GSTIN,
  ret_period: FilingPeriod
): RetPeriodEnvelope => ({
  gstin,
  ret_period,
  version: GST_SCHEMA_VERSION,
  hash: GST_HASH_PLACEHOLDER,
});

export const buildAnnualEnvelope = (
  gstin: GSTIN,
  fy: FinancialYear
): AnnualEnvelope => ({
  gstin,
  fy,
  version: GST_SCHEMA_VERSION,
  hash: GST_HASH_PLACEHOLDER,
});
