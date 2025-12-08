/**
 * PROXY CORS - Agrega headers CORS antes de pasar al túnel
 * 
 * Este proxy se ejecuta en un puerto local y agrega headers CORS
 * a todas las respuestas antes de pasarlas al túnel.
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
const PORT = 3002; // Puerto diferente al agente

// CORS para TODAS las peticiones
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Proxy al agente local
// IMPORTANTE: Usar 127.0.0.1 en lugar de localhost para evitar problemas con IPv6
app.use('/', createProxyMiddleware({
  target: 'http://127.0.0.1:3001',
  changeOrigin: true,
  timeout: 30000, // 30 segundos de timeout
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[PROXY] ${req.method} ${req.url} -> http://127.0.0.1:3001${req.url}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Agregar headers CORS adicionales
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  },
  onError: (err, req, res) => {
    console.error('[PROXY ERROR]', err.message);
    res.status(502).json({ 
      error: 'Proxy error', 
      message: err.message,
      target: 'http://127.0.0.1:3001'
    });
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Proxy CORS corriendo en http://0.0.0.0:${PORT}`);
  console.log(`💡 Expone este puerto con el túnel: lt --port ${PORT}`);
  console.log(`📡 Proxy apuntando a: http://127.0.0.1:3001`);
  console.log(`⏳ Esperando conexiones...`);
});

