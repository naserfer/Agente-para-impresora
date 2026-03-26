#!/usr/bin/env node

const { existsSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

const localAppData = process.env.LOCALAPPDATA || '';
const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

const candidates = [
  join(localAppData, 'Programs', 'Agente de Impresion', 'Agente de Impresion.exe'),
  join(localAppData, 'Programs', 'Agente de Impresion de KaruBox', 'Agente de Impresion de KaruBox.exe'),
  join(programFiles, 'Agente de Impresion', 'Agente de Impresion.exe'),
  join(programFiles, 'Agente de Impresion de KaruBox', 'Agente de Impresion de KaruBox.exe')
];

const exePath = candidates.find((p) => existsSync(p));

if (!exePath) {
  console.error('No se encontró el ejecutable instalado del agente.');
  console.error('Instalalo primero o ejecuta el reset con ruta manual al .exe.');
  process.exit(1);
}

console.log(`Ejecutando reset en: ${exePath}`);
const child = spawn(exePath, ['--reset-config'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: false
});

child.unref();
console.log('Comando enviado. Cerrá y volvé a abrir el agente para reconfigurar.');
process.exit(0);
