var path = require('path');
var webpack = require('webpack');

module.exports = {
  context: __dirname,
  entry: {
    index: './src/index'
  },
  output: {
    path: path.resolve('./dist/'),
    filename: "[name].js"
  },

  resolve: {
    extensions: ['.js', '.jsx'],
  },

  module: {
    rules: [
      {
        test: /\.(js|jsx|es6)$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['es2015', 'stage-2']
            }
          }
        ],
        exclude: /node_modules|example/
      }
    ]
  },
};
