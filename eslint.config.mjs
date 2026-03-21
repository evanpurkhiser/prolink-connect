import {common} from '@evanpurkhiser/eslint-config';

export default [
  ...common,
  {
    rules: {
      'prettier/prettier': 'off',
      'simple-import-sort/imports': 'off',
      'simple-import-sort/exports': 'off',
    },
  },
];
