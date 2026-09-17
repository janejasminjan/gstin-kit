import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/gstin/index.ts', 'src/tax/index.ts', 'src/invoice/index.ts', 'src/hsn/index.ts', 'src/gstr1/index.ts', 'src/gstr3b/index.ts'],
  format: ['esm'], dts: true, clean: true, sourcemap: true, splitting: false, treeshake: true, minify: false
});
