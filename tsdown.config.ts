import {defineConfig} from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    cli: 'src/cli/index.ts',
  },
  outDir: 'lib',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  shims: true,
  format: 'esm',
  dts: true,
  clean: true,
});
