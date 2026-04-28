import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.{spec,test}.ts'],
  },
  resolve: {
    alias: {
      src: new URL('./src/', import.meta.url).pathname,
      tests: new URL('./tests/', import.meta.url).pathname,
    },
  },
});
