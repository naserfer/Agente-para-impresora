#!/usr/bin/env node

/**
 * GENERADOR DE SQL POR CLIENTE
 * 
 * Lee cliente-config-[nombre].json y genera un SQL personalizado
 * basado en el template de atlas-burger.sql
 */

const fs = require('fs');
const path = require('path');

const clientName = process.argv[2];

if (!clientName) {
  console.error('❌ Debes especificar el nombre del cliente');
  console.log('💡 Uso: node generar-sql-cliente.js [nombre-cliente]');
  console.log('💡 Ejemplo: node generar-sql-cliente.js atlas-burger');
  process.exit(1);
}

// Cargar configuración
const configPath = path.join(__dirname, `cliente-config-${clientName}.json`);
if (!fs.existsSync(configPath)) {
  console.error(`❌ No existe: ${configPath}`);
  console.log('💡 Crea primero el archivo basándote en cliente-config.template.json');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log(`\n✅ Generando SQL para: ${config.cliente.nombre}\n`);

// Leer template
const templatePath = path.join(__dirname, 'packages/agent/database/atlas-burguer.sql');
let sql = fs.readFileSync(templatePath, 'utf8');

// Reemplazar valores
const replacements = {
  'Atlas Burger': config.cliente.nombre,
  'atlas-burger': config.cliente.slug,
  'atlas-burger-printer-1': config.impresora.printerId,
  'EPSON TM-T20III Receipt': config.impresora.nombreEsperado,
  'Cocina': config.impresora.ubicacion
};

for (const [oldValue, newValue] of Object.entries(replacements)) {
  sql = sql.replace(new RegExp(oldValue, 'g'), newValue);
}

// Guardar SQL personalizado
const outputPath = path.join(__dirname, `setup-${config.cliente.slug}.sql`);
fs.writeFileSync(outputPath, sql, 'utf8');

console.log(`✅ SQL generado: ${outputPath}\n`);
console.log('📋 Contenido personalizado:');
console.log(`   • Nombre: ${config.cliente.nombre}`);
console.log(`   • Slug: ${config.cliente.slug}`);
console.log(`   • Printer ID: ${config.impresora.printerId}`);
console.log(`   • Impresora: ${config.impresora.nombreEsperado}`);
console.log(`   • Ubicación: ${config.impresora.ubicacion}`);
console.log('\n💡 Ejecuta este SQL en Supabase para configurar el cliente\n');

