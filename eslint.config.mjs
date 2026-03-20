import {common} from '@evanpurkhiser/eslint-config';

export default [
  ...common,
  {
    rules: {
      'prettier/prettier': 'off',
    },
  },
];
