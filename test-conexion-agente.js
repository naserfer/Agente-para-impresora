/**
 * Script para probar la conexión al agente
 * Ejecuta: node test-conexion-agente.js
 */

const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PORT = 3001;

console.log('🔍 Diagnóstico de Conexión al Agente\n');
console.log('='.repeat(50));
console.log('');

// 1. Verificar si el puerto está escuchando
async function checkPortListening() {
  console.log('1. Verificando si el puerto está escuchando...');
  try {
    const { stdout } = await execAsync(`netstat -ano | findstr ":${PORT}" | findstr "LISTENING"`);
    if (stdout && stdout.trim()) {
      console.log('   ✅ Puerto está escuchando');
      console.log(`   ${stdout.trim()}`);
      return true;
    } else {
      console.log('   ❌ Puerto NO está escuchando');
      return false;
    }
  } catch (error) {
    console.log('   ❌ Puerto NO está escuchando');
    return false;
  }
}

// 2. Probar conexión HTTP directa
function testHttpConnection(hostname = 'localhost') {
  return new Promise((resolve) => {
    console.log(`\n2. Probando conexión HTTP a ${hostname}:${PORT}...`);
    
    const req = http.request({
      hostname: hostname,
      port: PORT,
      path: '/',
      method: 'GET',
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(`   ✅ Conexión exitosa (Status: ${res.statusCode})`);
        console.log(`   Respuesta: ${data.substring(0, 100)}...`);
        resolve({ success: true, status: res.statusCode, data });
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ Error de conexión: ${error.code} - ${error.message}`);
      resolve({ success: false, error: error.code, message: error.message });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      console.log('   ❌ Timeout: El servidor no respondió');
      resolve({ success: false, error: 'TIMEOUT' });
    });

    req.end();
  });
}

// 3. Probar health check
function testHealthCheck(hostname = 'localhost') {
  return new Promise((resolve) => {
    console.log(`\n3. Probando health check en ${hostname}:${PORT}/health...`);
    
    const req = http.request({
      hostname: hostname,
      port: PORT,
      path: '/health',
      method: 'GET',
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log(`   ✅ Health check exitoso (Status: ${res.statusCode})`);
          console.log(`   Estado: ${json.status}`);
          console.log(`   Impresoras: ${json.printersCount || 0}`);
          resolve({ success: true, data: json });
        } catch (e) {
          console.log(`   ⚠️  Respuesta recibida pero no es JSON válido`);
          resolve({ success: false, error: 'INVALID_JSON' });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`   ❌ Error: ${error.code} - ${error.message}`);
      resolve({ success: false, error: error.code });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      console.log('   ❌ Timeout');
      resolve({ success: false, error: 'TIMEOUT' });
    });

    req.end();
  });
}

// 4. Verificar firewall
async function checkFirewall() {
  console.log('\n4. Verificando reglas de firewall...');
  try {
    const { stdout } = await execAsync('netsh advfirewall firewall show rule name=all | findstr "3001"');
    if (stdout && stdout.trim()) {
      console.log('   Reglas encontradas:');
      console.log(`   ${stdout.trim()}`);
    } else {
      console.log('   ⚠️  No se encontraron reglas específicas para el puerto 3001');
      console.log('   💡 Puede que el firewall esté bloqueando la conexión');
    }
  } catch (error) {
    console.log('   ⚠️  No se pudo verificar firewall');
  }
}

// Ejecutar todas las pruebas
async function runDiagnostics() {
  const portListening = await checkPortListening();
  
  if (!portListening) {
    console.log('\n❌ El puerto no está escuchando. El agente puede no haber iniciado correctamente.');
    console.log('   Verifica que el agente esté corriendo.');
    return;
  }

  // Probar con localhost
  const localhostResult = await testHttpConnection('localhost');
  
  // Si falla con localhost, probar con 127.0.0.1
  if (!localhostResult.success) {
    console.log('\n   Intentando con 127.0.0.1...');
    await testHttpConnection('127.0.0.1');
  }

  // Probar health check
  await testHealthCheck('localhost');

  // Verificar firewall
  await checkFirewall();

  console.log('\n' + '='.repeat(50));
  console.log('\n📋 Resumen:');
  if (portListening && localhostResult.success) {
    console.log('✅ El agente está funcionando correctamente');
    console.log('💡 Si el desktop no puede conectar, puede ser un problema de:');
    console.log('   - Firewall bloqueando conexiones desde Electron');
    console.log('   - El desktop está verificando antes de que el servidor esté listo');
  } else {
    console.log('❌ Hay problemas con la conexión');
    console.log('💡 Soluciones:');
    console.log('   1. Verifica que el agente esté corriendo');
    console.log('   2. Revisa el firewall de Windows');
    console.log('   3. Verifica los logs del agente');
  }
}

runDiagnostics().catch(console.error);

