import {defineConfig} from 'tsdown';

const entry = {
  index: 'src/index.ts',
  types: 'src/types.ts',
  cli: 'src/cli/index.ts',
};

const shared = {
  entry,
  outDir: 'lib',
  platform: 'node' as const,
  target: 'node20',
  sourcemap: true,
  shims: true,
};

export default defineConfig([
  {
    ...shared,
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    format: 'cjs',
    dts: {emitDtsOnly: true},
  },
]);
