# gstin-kit

A dependency-free TypeScript toolkit for Indian GST applications, extracted and consolidated from the production InvoBill codebase.

## Install

```bash
npm install gstin-kit
```

## GSTIN format validation

```ts
import { validateGstin } from 'gstin-kit/gstin';

validateGstin('27AAPFU0939F1ZV');
// { valid: true, normalized: '27AAPFU0939F1ZV', stateCode: '27', stateName: 'Maharashtra', errors: [] }
```

This release checks the official 15-character structure and known state code. It does **not** claim portal verification or legal-entity verification. It also does not calculate the GSTIN checksum yet.

## CGST, SGST and IGST

```ts
import { classifySupply, calculateGst } from 'gstin-kit/tax';

const supplyType = classifySupply({ supplierState: '27', placeOfSupply: '29' });
const tax = calculateGst({ taxableValue: 10_000, rate: 18, supplyType });
// IGST: 1800
```

Two rounding strategies are named explicitly:
- `money2`: two decimal places, the default for line and invoice calculations
- `nearestRupee`: whole-rupee statutory-style rounding
- `none`: no rounding

## Invoice totals

```ts
import { calculateLineItem, calculateInvoice } from 'gstin-kit/invoice';

const line = calculateLineItem(
  { quantity: 2, unitPrice: 500, discountPercent: 10, gstRate: 18 },
  { supplierState: '27', placeOfSupply: '27' }
);
const totals = calculateInvoice([line], { roundOff: true });
```

Line math supports cascading discounts, cess, free goods, CGST/SGST or IGST, invoice discounts and round-off.

## HSN and SAC

```ts
import { validateHsn, validateSac, toUqc, buildHsnSummary } from 'gstin-kit/hsn';
```

`gstin-kit` validates HSN/SAC code shapes, converts common units to UQC and builds HSN summaries. It does **not** bundle or promise authoritative HSN/SAC classifications or tax rates. Pass the rate from your maintained source.

## GST returns

```ts
import { buildGstr1 } from 'gstin-kit/gstr1';
import { buildGstr3b } from 'gstin-kit/gstr3b';
```

v1 includes typed builders for GSTR-1 and GSTR-3B. They return `{ json, issues }`, letting callers block on validation errors before serialization. Planned later subpaths include GSTR-1A/IFF, GSTR-2B parsing, GSTR-4, 6, 7, 8, 9 and 9C after their schemas receive independent verification and fixtures.

## Scope and responsibility

This library performs deterministic calculations and shapes return data. It does not connect to the GST portal, file returns, look up taxpayers, provide tax or legal advice, or replace verification against current GSTN schemas and applicable law. Rules and schemas change. Pin versions and test with your accountant or compliance provider before production filing.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Publishing is triggered by a GitHub Release. Add an npm automation token as the repository secret `NPM_TOKEN` before publishing a release.

## License

MIT
