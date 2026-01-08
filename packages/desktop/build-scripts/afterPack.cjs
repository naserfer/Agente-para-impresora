const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

exports.default = async function(context) {
  console.log('\n🔧 Copying agent dependencies...\n');
  
  const agentPath = path.join(
    context.appOutDir,
    'resources',
    'agent'
  );

  if (!fs.existsSync(agentPath)) {
    console.error('❌ Agent directory not found:', agentPath);
    return;
  }

  // Ruta al agente en el proyecto
  const sourceAgentPath = path.join(__dirname, '../../agent');
  
  // En un monorepo con workspaces, las dependencias están en la raíz
  const rootNodeModules = path.join(__dirname, '../../../node_modules');
  const agentNodeModules = path.join(sourceAgentPath, 'node_modules');
  
  // SIEMPRE usar node_modules de la raíz (monorepo con workspaces)
  const sourceNodeModules = rootNodeModules;
  
  const destNodeModules = path.join(agentPath, 'node_modules');

  console.log('📦 Monorepo root node_modules:', sourceNodeModules);
  console.log('📦 Destination:', destNodeModules);
  console.log('📦 Source exists:', fs.existsSync(sourceNodeModules));
  
  if (!fs.existsSync(sourceNodeModules)) {
    console.error('❌ Source node_modules not found. Please run npm install in the agent directory first.');
    return;
  }

  try {
    console.log('📦 Copying COMPLETE node_modules from monorepo root...');
    console.log('⚠️ This will take 2-3 minutes but ensures ALL dependencies are included');
    
    // Verificar que el source existe antes de copiar
    if (!fs.existsSync(sourceNodeModules)) {
      throw new Error(`Source node_modules not found at: ${sourceNodeModules}`);
    }
    
    // Limpiar node_modules si existe (evitar symlinks corruptos)
    if (fs.existsSync(destNodeModules)) {
      console.log('🗑️ Cleaning existing node_modules...');
      try {
        fs.rmSync(destNodeModules, { recursive: true, force: true, maxRetries: 3 });
      } catch (cleanErr) {
        console.warn('⚠️ Could not clean node_modules, trying to continue...');
      }
    }
    
    console.log('\n📦 Installing dependencies in agent directory...');
    const startTime = Date.now();
    
    // Copiar package.json del agente al destino
    const sourcePackageJson = path.join(__dirname, '../../agent/package.json');
    const destPackageJson = path.join(agentPath, 'package.json');
    
    if (fs.existsSync(sourcePackageJson)) {
      fs.copyFileSync(sourcePackageJson, destPackageJson);
      console.log('✅ package.json copied');
    }
    
    // Ejecutar npm install en el directorio del agente (más confiable que copiar)
    // Usar --ignore-scripts para evitar problemas con compilación de módulos nativos
    console.log('Running npm install in agent directory (ignoring native scripts)...');
    try {
      execSync('npm install --production --no-audit --no-fund --ignore-scripts', {
        cwd: agentPath,
        stdio: 'inherit', // Mostrar el progreso
        windowsHide: false
      });
      console.log('✅ npm install completed');
    } catch (err) {
      throw new Error(`npm install failed: ${err.message}`);
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Dependencies installed in ${elapsed}s`);
    
    // Verificar módulos críticos finales
    console.log('\n🔍 Final verification:');
    const criticalModules = ['ws', 'express', 'cors', 'body-parser', 'ee-first'];
    let allPresent = true;
    
    for (const module of criticalModules) {
      const destPath = path.join(destNodeModules, module);
      if (fs.existsSync(destPath)) {
        console.log(`  ✅ ${module} ready`);
      } else {
        console.error(`  ❌ ${module} NOT FOUND`);
        allPresent = false;
      }
    }
    
    if (!allPresent) {
      throw new Error('Some critical modules were not copied');
    }
    
    console.log('\n✅ Agent dependencies copied successfully\n');
  } catch (error) {
    console.error('\n❌ Error copying agent dependencies:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
};

