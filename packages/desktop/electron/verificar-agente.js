/**
 * Script para verificar que el agente se puede iniciar correctamente
 * Útil para diagnosticar problemas de inicio
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const agentPath = path.join(__dirname, '../../agent/server.js');
const agentDir = path.join(__dirname, '../../agent');

console.log('🔍 Verificando agente...\n');
console.log(`Directorio: ${agentDir}`);
console.log(`Archivo: ${agentPath}\n`);

const fs = require('fs');
if (!fs.existsSync(agentPath)) {
  console.error('❌ El archivo del agente no existe');
  process.exit(1);
}

if (!fs.existsSync(agentDir)) {
  console.error('❌ El directorio del agente no existe');
  process.exit(1);
}

console.log('✅ Archivos encontrados\n');
console.log('🚀 Iniciando agente...\n');

const agentProcess = spawn('node', [agentPath], {
  cwd: agentDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'development'
  }
});

let output = '';
let serverReady = false;

agentProcess.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
  
  if (text.includes('Escuchando en') || text.includes('Agente de impresión iniciado')) {
    serverReady = true;
  }
});

agentProcess.stderr.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stderr.write(text);
});

agentProcess.on('close', (code) => {
  console.log(`\n\nProceso terminado con código: ${code}`);
  if (code !== 0) {
    console.error('❌ El agente falló al iniciar');
    console.error('Output:', output);
    process.exit(1);
  }
});

// Esperar 5 segundos y verificar
setTimeout(() => {
  if (serverReady) {
    console.log('\n✅ Servidor reportó estar listo');
  } else {
    console.log('\n⚠️  Servidor no reportó estar listo');
  }
  
  // Intentar conectar
  const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/',
    method: 'GET',
    timeout: 2000
  }, (res) => {
    console.log(`✅ Conexión exitosa (Status: ${res.statusCode})`);
    agentProcess.kill();
    process.exit(0);
  });
  
  req.on('error', (error) => {
    console.error(`❌ No se puede conectar: ${error.message}`);
    console.error('\nOutput completo:');
    console.error(output);
    agentProcess.kill();
    process.exit(1);
  });
  
  req.setTimeout(2000, () => {
    req.destroy();
    console.error('❌ Timeout al conectar');
    agentProcess.kill();
    process.exit(1);
  });
  
  req.end();
}, 5000);

