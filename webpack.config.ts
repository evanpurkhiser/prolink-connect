import * as webpack from 'webpack';
import nodeExternals from 'webpack-node-externals';
import path from 'path';

const config: webpack.Configuration = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    index: './src/index.ts',
    cli: 'src/cli/index',
  },
  target: 'node',
  externals: [nodeExternals()],
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {src: path.join(__dirname, 'src')},
  },
  devtool: 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.ksy$/,
        use: ['kaitai-struct-loader'],
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: ['ts-loader'],
      },
    ],
  },
};

export default config;
