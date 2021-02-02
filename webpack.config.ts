import tsTransformPaths from '@zerollup/ts-transform-paths';
import * as webpack from 'webpack';
import nodeExternals from 'webpack-node-externals';

import path from 'path';

const IS_DEV = process.env.NODE_ENV !== 'production';

const config: webpack.Configuration = {
  mode: IS_DEV ? 'development' : 'production',
  entry: {
    index: './src/index.ts',
    types: './src/types.ts',
    ...(IS_DEV ? {cli: 'src/cli/index'} : {}),
  },
  target: 'node',
  externals: [nodeExternals() as any],
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
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
        options: {
          getCustomTransformers: (program: any) => {
            const transformer = tsTransformPaths(program);
            return {
              before: [transformer.before],
              afterDeclarations: [transformer.afterDeclarations],
            };
          },
        },
      },
    ],
  },
};

export default config;
