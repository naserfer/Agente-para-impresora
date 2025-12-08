/**
 * TUNNEL MANAGER - Inicia túnel automáticamente
 * 
 * Cuando el agente arranca, inicia un túnel (localtunnel o cloudflare) para exponer el puerto local a internet.
 * Esto permite que la app web en Vercel se conecte al agente desde cualquier lugar.
 * 
 * Soporta:
 * - localtunnel: 100% GRATIS, subdomain fijo opcional
 * - cloudflare: 100% GRATIS, subdomain fijo incluido, más estable
 */

const { spawn } = require('child_process');
const logger = require('./logger');
const config = require('./config');

let tunnelProcess = null;
let tunnelUrl = null;
let isStarting = false;

/**
 * Verifica si ya hay un túnel corriendo en el puerto
 */
function checkExistingTunnel(port) {
  return new Promise((resolve) => {
    try {
      // Intentar conectar al puerto para ver si hay algo escuchando
      const test = require('net').createConnection(port, '127.0.0.1', () => {
        test.end();
        resolve(true); // Hay algo escuchando
      });
      test.on('error', () => {
        resolve(false); // No hay nada escuchando
      });
      test.setTimeout(500, () => {
        test.destroy();
        resolve(false);
      });
    } catch (error) {
      resolve(false);
    }
  });
}

/**
 * Verifica si hay procesos localtunnel corriendo y los detiene
 */
function killExistingTunnels() {
  return new Promise((resolve) => {
    try {
      const { exec } = require('child_process');
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // Windows: buscar procesos node con localtunnel usando PowerShell
        const psCommand = 'Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { try { $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine; return ($cmdLine -like "*localtunnel*") } catch { return $false } } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }';
        exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
          if (!error && stdout) {
            logger.info('Procesos localtunnel existentes detenidos', { service: 'tunnel-manager' });
          }
          setTimeout(resolve, 2000);
        });
      } else {
        // Linux/Mac: usar pkill
        exec('pkill -f "localtunnel.*--port"', () => {
          setTimeout(resolve, 2000);
        });
      }
    } catch (error) {
      logger.warn(`Error al detener túneles existentes: ${error.message}`, { service: 'tunnel-manager' });
      setTimeout(resolve, 2000);
    }
  });
}

/**
 * Inicia el túnel usando localtunnel o cloudflare según configuración
 */
function startTunnel() {
  // Verificar qué tipo de túnel usar
  if (config.tunnelType === 'cloudflare') {
    return startCloudflareTunnel();
  } else {
    return startLocaltunnel();
  }
}

/**
 * Inicia el túnel usando localtunnel - GRATIS
 */
function startLocaltunnel() {
  return new Promise(async (resolve, reject) => {
    // Prevenir múltiples intentos simultáneos
    if (isStarting) {
      logger.warn('Ya hay un túnel iniciándose, esperando...', { service: 'tunnel-manager' });
      return reject(new Error('Tunnel is already starting'));
    }

    // Si ya hay un túnel corriendo, no crear otro
    if (tunnelProcess && !tunnelProcess.killed) {
      logger.warn('Ya hay un túnel corriendo, reutilizando...', { service: 'tunnel-manager' });
      if (tunnelUrl) {
        return resolve(tunnelUrl);
      }
    }

    isStarting = true;

    // Detener túneles existentes antes de iniciar uno nuevo
    logger.info('Verificando y deteniendo túneles existentes...', { service: 'tunnel-manager' });
    await killExistingTunnels();

    // Si había un proceso, detenerlo
    if (tunnelProcess && !tunnelProcess.killed) {
      logger.info('Deteniendo túnel anterior...', { service: 'tunnel-manager' });
      tunnelProcess.kill();
      tunnelProcess = null;
      tunnelUrl = null;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info('Iniciando túnel automático con localtunnel (GRATIS)...', { service: 'tunnel-manager' });

    // Puerto del agente directamente (el agente ya tiene CORS configurado)
    const agentPort = config.port || 3001;

    // Construir comando localtunnel
    // npx localtunnel --port 3001 --subdomain atlas-burger-print
    const tunnelArgs = ['localtunnel', '--port', agentPort.toString()];
    
    // Usar subdomain fijo si está configurado
    if (config.tunnelSubdomain) {
      tunnelArgs.push('--subdomain', config.tunnelSubdomain);
      logger.info(`Usando subdomain fijo: ${config.tunnelSubdomain}`, { service: 'tunnel-manager' });
      logger.info(`URL será: https://${config.tunnelSubdomain}.loca.lt`, { service: 'tunnel-manager' });
      logger.info(`💡 Esta URL NO cambiará al reiniciar el agente`, { service: 'tunnel-manager' });
    } else {
      logger.info('Generando URL temporal automática (sin contraseña)...', { service: 'tunnel-manager' });
      logger.info('💡 La URL cambiará cada vez que reinicies el agente', { service: 'tunnel-manager' });
    }

    // Usar npx para ejecutar localtunnel
    logger.info(`Ejecutando: npx ${tunnelArgs.join(' ')}`, { service: 'tunnel-manager' });
    
    tunnelProcess = spawn('npx', tunnelArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', DEBUG: '' }
    });
    
    logger.info(`Proceso túnel iniciado (PID: ${tunnelProcess.pid})`, { service: 'tunnel-manager' });
    
    // Agregar listeners
    tunnelProcess.stdout.setEncoding('utf8');
    tunnelProcess.stderr.setEncoding('utf8');
    
    let output = '';
    let errorOutput = '';

    tunnelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      const lines = text.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        logger.info(`[LOCALTUNNEL STDOUT] ${line.trim()}`, { service: 'tunnel-manager' });
      });
      
      // Buscar la URL en el output de localtunnel
      // localtunnel muestra: "your url is: https://atlas-burger-print.loca.lt"
      const urlPatterns = [
        /your url is:\s*(https?:\/\/[^\s]+)/i,
        /(https?:\/\/[^\s]+\.loca\.lt)/i,
        /url:\s*(https?:\/\/[^\s]+)/i
      ];
      
      for (const pattern of urlPatterns) {
        const urlMatch = text.match(pattern);
        if (urlMatch && !tunnelUrl) {
          tunnelUrl = urlMatch[1] || urlMatch[0];
          logger.info(`✅ Túnel localtunnel iniciado: ${tunnelUrl}`, { service: 'tunnel-manager' });
          
          const domain = tunnelUrl.replace(/https?:\/\//, '').split('/')[0];
          logger.info(`💡 Actualiza Supabase con: agent_ip = '${domain}', agent_port = 443`, { service: 'tunnel-manager' });
          
          if (config.tunnelSubdomain) {
            logger.info(`✅ URL fija configurada: ${tunnelUrl}`, { service: 'tunnel-manager' });
            logger.info(`💡 Esta URL NO cambiará al reiniciar el agente`, { service: 'tunnel-manager' });
            logger.info(`💡 Vercel podrá conectarse a: ${tunnelUrl}`, { service: 'tunnel-manager' });
          } else {
            logger.warn(`⚠️ URL temporal: ${tunnelUrl}`, { service: 'tunnel-manager' });
            logger.warn(`⚠️ Esta URL cambiará al reiniciar - configura TUNNEL_SUBDOMAIN para URL fija`, { service: 'tunnel-manager' });
          }
          
          isStarting = false;
          resolve(tunnelUrl);
          break;
        }
      }
    });

    tunnelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      const lines = text.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        logger.info(`[LOCALTUNNEL STDERR] ${line.trim()}`, { service: 'tunnel-manager' });
      });
      
      // Buscar URL también en stderr
      const urlMatch = text.match(/your url is:\s*(https?:\/\/[^\s]+)/i);
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[1];
        logger.info(`✅ Túnel localtunnel iniciado: ${tunnelUrl}`, { service: 'tunnel-manager' });
        
        const domain = tunnelUrl.replace(/https?:\/\//, '').split('/')[0];
        logger.info(`💡 Actualiza Supabase con: agent_ip = '${domain}', agent_port = 443`, { service: 'tunnel-manager' });
        
        isStarting = false;
        resolve(tunnelUrl);
      }
    });

    tunnelProcess.on('error', (error) => {
      isStarting = false;
      logger.error(`No se pudo iniciar localtunnel: ${error.message}`, { service: 'tunnel-manager' });
      logger.error(`Error completo: ${error.stack}`, { service: 'tunnel-manager' });
      logger.error(`Error output: ${errorOutput}`, { service: 'tunnel-manager' });
      logger.error('💡 Asegúrate de que npx esté disponible', { service: 'tunnel-manager' });
      reject(error);
    });

    // Si hay subdomain configurado, construir la URL esperada después de un delay
    if (config.tunnelSubdomain) {
      setTimeout(() => {
        if (!tunnelUrl) {
          const expectedUrl = `https://${config.tunnelSubdomain}.loca.lt`;
          if (tunnelProcess && !tunnelProcess.killed) {
            tunnelUrl = expectedUrl;
            logger.info(`✅ Túnel localtunnel iniciado: ${tunnelUrl}`, { service: 'tunnel-manager' });
            logger.info(`✅ URL fija configurada: ${expectedUrl}`, { service: 'tunnel-manager' });
            logger.info(`💡 Esta URL NO cambiará al reiniciar el agente`, { service: 'tunnel-manager' });
            logger.info(`💡 Vercel podrá conectarse a: ${expectedUrl}`, { service: 'tunnel-manager' });
            const domain = expectedUrl.replace(/https?:\/\//, '').split('/')[0];
            logger.info(`💡 Actualiza Supabase UNA VEZ con: agent_ip = '${domain}', agent_port = 443`, { service: 'tunnel-manager' });
            isStarting = false;
            resolve(tunnelUrl);
          }
        }
      }, 15000); // Esperar 15 segundos para que el túnel se establezca
    }

    // Timeout después de 60 segundos (más tiempo para subdomain fijo)
    setTimeout(() => {
      if (!tunnelUrl) {
        isStarting = false;
        logger.warn('Timeout esperando URL del túnel localtunnel', { service: 'tunnel-manager' });
        logger.warn(`Output capturado: ${output}`, { service: 'tunnel-manager' });
        logger.warn(`Error output: ${errorOutput}`, { service: 'tunnel-manager' });
        if (config.tunnelSubdomain) {
          logger.warn(`💡 El subdomain '${config.tunnelSubdomain}' puede estar ocupado`, { service: 'tunnel-manager' });
          logger.warn(`💡 O el servicio localtunnel está teniendo problemas`, { service: 'tunnel-manager' });
        } else {
          logger.warn('💡 El túnel puede tardar más en establecerse', { service: 'tunnel-manager' });
        }
        reject(new Error('Timeout esperando URL del túnel localtunnel'));
      }
    }, 60000);
  });
}

/**
 * Inicia el túnel usando Cloudflare Tunnel (cloudflared) - GRATIS y más estable
 */
function startCloudflareTunnel() {
  return new Promise(async (resolve, reject) => {
    // Prevenir múltiples intentos simultáneos
    if (isStarting) {
      logger.warn('Ya hay un túnel iniciándose, esperando...', { service: 'tunnel-manager' });
      return reject(new Error('Tunnel is already starting'));
    }

    // Si ya hay un túnel corriendo, no crear otro
    if (tunnelProcess && !tunnelProcess.killed) {
      logger.warn('Ya hay un túnel corriendo, reutilizando...', { service: 'tunnel-manager' });
      if (tunnelUrl) {
        return resolve(tunnelUrl);
      }
    }

    // Validar configuración de Cloudflare
    if (!config.cloudflareTunnelUUID) {
      // Silenciar error - túnel no es necesario con Supabase Realtime
      return reject(new Error('CLOUDFLARE_TUNNEL_UUID is required for Cloudflare tunnel'));
    }

    isStarting = true;

    // Detener túneles existentes antes de iniciar uno nuevo
    logger.info('Verificando y deteniendo túneles existentes...', { service: 'tunnel-manager' });
    await killExistingTunnels();

    // Si había un proceso, detenerlo
    if (tunnelProcess && !tunnelProcess.killed) {
      logger.info('Deteniendo túnel anterior...', { service: 'tunnel-manager' });
      tunnelProcess.kill();
      tunnelProcess = null;
      tunnelUrl = null;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info('Iniciando túnel automático con Cloudflare Tunnel (cloudflared)...', { service: 'tunnel-manager' });

    const agentPort = config.port || 3001;

    // Construir comando cloudflared
    // cloudflared tunnel run <tunnel-name> --url http://localhost:3001
    // O si usamos UUID directamente: cloudflared tunnel --url http://localhost:3001
    const tunnelArgs = ['tunnel', 'run', config.cloudflareTunnelUUID, '--url', `http://localhost:${agentPort}`];

    logger.info(`Ejecutando: cloudflared ${tunnelArgs.join(' ')}`, { service: 'tunnel-manager' });
    
    tunnelProcess = spawn('cloudflared', tunnelArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', DEBUG: '' }
    });
    
    logger.info(`Proceso túnel Cloudflare iniciado (PID: ${tunnelProcess.pid})`, { service: 'tunnel-manager' });
    
    // Agregar listeners
    tunnelProcess.stdout.setEncoding('utf8');
    tunnelProcess.stderr.setEncoding('utf8');
    
    let output = '';
    let errorOutput = '';

    tunnelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      const lines = text.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        logger.info(`[CLOUDFLARE STDOUT] ${line.trim()}`, { service: 'tunnel-manager' });
      });
      
      // Buscar la URL en el output de cloudflared
      // cloudflared muestra: "https://atlas-burger-print.tudominio.com"
      const urlPatterns = [
        /(https?:\/\/[^\s]+\.cfargotunnel\.com)/i,
        /(https?:\/\/[^\s]+\.trycloudflare\.com)/i,
        /(https?:\/\/[^\s]+)/i
      ];
      
      for (const pattern of urlPatterns) {
        const urlMatch = text.match(pattern);
        if (urlMatch && !tunnelUrl) {
          tunnelUrl = urlMatch[1] || urlMatch[0];
          logger.info(`✅ Túnel Cloudflare iniciado: ${tunnelUrl}`, { service: 'tunnel-manager' });
          
          const domain = tunnelUrl.replace(/https?:\/\//, '').split('/')[0];
          logger.info(`💡 Actualiza Supabase con: agent_ip = '${domain}', agent_port = 443`, { service: 'tunnel-manager' });
          
          isStarting = false;
          resolve(tunnelUrl);
          break;
        }
      }
    });

    tunnelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      const lines = text.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        logger.info(`[CLOUDFLARE STDERR] ${line.trim()}`, { service: 'tunnel-manager' });
      });
      
      // Buscar URL también en stderr
      const urlPatterns = [
        /(https?:\/\/[^\s]+\.cfargotunnel\.com)/i,
        /(https?:\/\/[^\s]+\.trycloudflare\.com)/i
      ];
      
      for (const pattern of urlPatterns) {
        const urlMatch = text.match(pattern);
        if (urlMatch && !tunnelUrl) {
          tunnelUrl = urlMatch[1] || urlMatch[0];
          logger.info(`✅ Túnel Cloudflare iniciado: ${tunnelUrl}`, { service: 'tunnel-manager' });
          
          const domain = tunnelUrl.replace(/https?:\/\//, '').split('/')[0];
          logger.info(`💡 Actualiza Supabase con: agent_ip = '${domain}', agent_port = 443`, { service: 'tunnel-manager' });
          
          isStarting = false;
          resolve(tunnelUrl);
          break;
        }
      }
    });

    tunnelProcess.on('error', (error) => {
      isStarting = false;
      logger.error(`No se pudo iniciar Cloudflare Tunnel: ${error.message}`, { service: 'tunnel-manager' });
      logger.error(`Error completo: ${error.stack}`, { service: 'tunnel-manager' });
      logger.error(`Error output: ${errorOutput}`, { service: 'tunnel-manager' });
      logger.error('💡 Asegúrate de que cloudflared esté instalado y en PATH', { service: 'tunnel-manager' });
      logger.error('💡 Ejecuta: cloudflared --version para verificar', { service: 'tunnel-manager' });
      reject(error);
    });

    // Si hay dominio configurado, usar ese después de un delay
    if (config.cloudflareTunnelDomain) {
      setTimeout(() => {
        if (!tunnelUrl) {
          const expectedUrl = `https://${config.cloudflareTunnelDomain}`;
          if (tunnelProcess && !tunnelProcess.killed) {
            tunnelUrl = expectedUrl;
            logger.info(`✅ Túnel Cloudflare iniciado: ${tunnelUrl}`, { service: 'tunnel-manager' });
            logger.info(`✅ URL fija configurada: ${expectedUrl}`, { service: 'tunnel-manager' });
            logger.info(`💡 Esta URL NO cambiará al reiniciar el agente`, { service: 'tunnel-manager' });
            logger.info(`💡 Vercel podrá conectarse a: ${expectedUrl}`, { service: 'tunnel-manager' });
            const domain = expectedUrl.replace(/https?:\/\//, '').split('/')[0];
            logger.info(`💡 Actualiza Supabase UNA VEZ con: agent_ip = '${domain}', agent_port = 443`, { service: 'tunnel-manager' });
            isStarting = false;
            resolve(tunnelUrl);
          }
        }
      }, 10000); // Esperar 10 segundos para que el túnel se establezca
    }

    // Timeout después de 60 segundos
    setTimeout(() => {
      if (!tunnelUrl) {
        isStarting = false;
        logger.warn('Timeout esperando URL del túnel Cloudflare', { service: 'tunnel-manager' });
        logger.warn(`Output capturado: ${output}`, { service: 'tunnel-manager' });
        logger.warn(`Error output: ${errorOutput}`, { service: 'tunnel-manager' });
        if (config.cloudflareTunnelDomain) {
          logger.warn(`💡 El dominio '${config.cloudflareTunnelDomain}' puede no estar configurado correctamente`, { service: 'tunnel-manager' });
          logger.warn(`💡 Verifica el DNS en Cloudflare Dashboard`, { service: 'tunnel-manager' });
        } else {
          logger.warn('💡 El túnel puede tardar más en establecerse', { service: 'tunnel-manager' });
        }
        reject(new Error('Timeout esperando URL del túnel Cloudflare'));
      }
    }, 60000);
  });
}

/**
 * Detiene el túnel
 */
function stopTunnel() {
  if (tunnelProcess) {
    logger.info('Deteniendo túnel...', { service: 'tunnel-manager' });
    tunnelProcess.kill();
    tunnelProcess = null;
    tunnelUrl = null;
    isStarting = false;
  }
  
  // También detener cualquier proceso huérfano
  if (config.tunnelType === 'localtunnel') {
    killExistingTunnels().catch(() => {});
  }
}

/**
 * Obtiene la URL del túnel actual
 */
function getTunnelUrl() {
  return tunnelUrl;
}

module.exports = {
  startTunnel,
  stopTunnel,
  getTunnelUrl
};

