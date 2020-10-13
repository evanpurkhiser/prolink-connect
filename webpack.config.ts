import * as webpack from 'webpack';
import nodeExternals from 'webpack-node-externals';
import path from 'path';
import tsTransformPaths from '@zerollup/ts-transform-paths';

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

const config: webpack.Configuration = {
  mode,
  entry: {
    index: './src/index.ts',
    types: './src/types.ts',
    ...(mode === 'development' ? {cli: 'src/cli/index'} : {}),
  },
  target: 'node',
  externals: [nodeExternals()],
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
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
