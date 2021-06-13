const fs = require('fs');

module.exports = {
  chainWebpack: config => {},
  devServer: {
    https: {
      key: fs.readFileSync('./certificates/ubii.private-key.pem'),
      cert: fs.readFileSync('./certificates/ubii.cert.pem'),
    }
  }
};
