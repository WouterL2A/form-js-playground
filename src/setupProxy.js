// src/setupProxy.js
// Proxies /api/* from CRA dev server -> FastAPI at http://localhost:8000
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
      // optional: log proxy decisions
      // logLevel: 'debug',
    })
  );
};
