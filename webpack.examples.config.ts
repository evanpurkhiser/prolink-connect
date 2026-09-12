import * as webpack from 'webpack';
import nodeExternals from 'webpack-node-externals';

import path from 'path';

/**
 * Bundles the runnable examples into `lib/examples/`.
 *
 * Kept separate from the library build: adding an entry outside `src/` to that
 * program shifts TypeScript's root directory and moves the emitted `.d.ts`
 * files under `lib/src/`, which breaks the package's `types` entry.
 */
const config: webpack.Configuration = {
  mode: 'development',
  entry: {
    'stagehand-monitor': './examples/stagehand-monitor.ts',
  },
  target: 'node',
  externals: [nodeExternals() as any],
  output: {
    path: path.resolve(__dirname, 'lib/examples'),
    filename: '[name].js',
  },
  optimization: {
    minimize: false,
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {src: path.join(__dirname, 'src')},
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ksy$/,
        use: ['kaitai-struct-loader'],
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
        // Type-check only what is bundled; the root tsconfig has no `include`,
        // so the program would otherwise sweep in every example and test.
        options: {onlyCompileBundledFiles: true},
      },
    ],
  },
};

export default config;
