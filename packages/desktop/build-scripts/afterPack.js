const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function(context) {
  console.log('\n🔧 Installing agent dependencies...\n');
  
  const agentPath = path.join(
    context.appOutDir,
    'resources',
    'agent'
  );

  if (!fs.existsSync(agentPath)) {
    console.error('❌ Agent directory not found:', agentPath);
    return;
  }

  console.log('📦 Agent path:', agentPath);
  
  try {
    // Instalar solo dependencias de producción
    execSync('npm install --omit=dev --no-audit --no-fund', {
      cwd: agentPath,
      stdio: 'inherit',
      shell: true
    });
    
    console.log('\n✅ Agent dependencies installed successfully\n');
  } catch (error) {
    console.error('\n❌ Error installing agent dependencies:', error.message);
    throw error;
  }
};

