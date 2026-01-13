/**
 * PRINTER MANAGER - Gestor de Impresoras
 * 
 * ¿Qué hace este archivo?
 * - Mantiene una lista de todas las impresoras configuradas
 * - Cada impresora tiene un ID único (printerId) que identifica a qué lomitería pertenece
 * - Cuando llega una orden de impresión, busca la impresora correcta usando el printerId
 * - Se comunica con la impresora física (USB o red) para enviar los comandos
 * 
 * ¿Cómo identifica qué lomitería es?
 * - Cada impresora se configura con un printerId único (ej: "lomiteria-001")
 * - Este ID generalmente es el mismo que el ID de la lomitería
 * - Cuando tu app web envía una orden, incluye el printerId
 * - Este archivo busca la impresora con ese ID y usa esa impresora específica
 */

const escpos = require('escpos');
const usb = require('escpos-usb');
const network = require('escpos-network');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const logger = require('../logger');

// Archivo para persistir configuraciones de impresoras
// Si está corriendo desde Electron (en Program Files), usar userData
// Si está en desarrollo, usar el directorio del proyecto
let PRINTERS_CONFIG_FILE;
if (process.env.ELECTRON_RUN_AS_NODE) {
  // Está corriendo desde Electron, usar una ruta accesible
  const appDataPath = process.env.APPDATA || process.env.LOCALAPPDATA || os.homedir();
  PRINTERS_CONFIG_FILE = path.join(appDataPath, 'Agente de Impresion', 'printers-config.json');
  
  // Asegurar que el directorio existe
  try {
    const configDir = path.dirname(PRINTERS_CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  } catch (error) {
    // Si falla, usar temp como fallback
    PRINTERS_CONFIG_FILE = path.join(os.tmpdir(), 'agente-impresion', 'printers-config.json');
    try {
      const configDir = path.dirname(PRINTERS_CONFIG_FILE);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
    } catch (tempError) {
      logger.warn('⚠️ No se pudo crear directorio para printers-config, usando directorio actual');
      PRINTERS_CONFIG_FILE = path.join(__dirname, '../../printers-config.json');
    }
  }
} else {
  // Desarrollo o ejecución directa, usar directorio del proyecto
  PRINTERS_CONFIG_FILE = path.join(__dirname, '../../printers-config.json');
}

// Función auxiliar para método alternativo de impresión en Windows
// Usa el método de compartir impresora y copy /b (método más confiable para ESC/POS)
function tryAlternativePrintMethod(printerName, data, resolve, reject) {
  const printData = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const tempFile = path.join(os.tmpdir(), `ticket-alt-${Date.now()}.raw`);
  fs.writeFileSync(tempFile, printData);
  
  // Método 1: Intentar usar copy /b con la impresora compartida
  // Primero verificar si la impresora está compartida
  const psScript = `
    $printerName = '${printerName}'
    $file = '${tempFile}'
    
    # Obtener información de la impresora
    $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
    if (-not $printer) {
      Write-Output "ERROR: Impresora no encontrada: $printerName"
      exit 1
    }
    
    # Método 1: Si la impresora está compartida, usar copy /b
    if ($printer.Shared) {
      $computerName = $env:COMPUTERNAME
      $shareName = $printer.ShareName
      $printerPath = "\\\\$computerName\\$shareName"
      
      try {
        $fileEscaped = $file -replace '"', '""'
        $printerPathEscaped = $printerPath -replace '"', '""'
        $cmd = 'copy /b "' + $fileEscaped + '" "' + $printerPathEscaped + '"'
        $result = cmd /c $cmd
        if ($LASTEXITCODE -eq 0) {
          Write-Output "SUCCESS"
          exit 0
        } else {
          Write-Output "ERROR: copy /b falló con código $LASTEXITCODE"
        }
      } catch {
        Write-Output "ERROR: $($_.Exception.Message)"
      }
    }
    
    # Método 2: Intentar compartir automáticamente y usar copy /b
    try {
      # Si la impresora no está compartida, intentar compartirla
      if (-not $printer.Shared) {
        try {
          $shareName = $printerName -replace '[^a-zA-Z0-9_]', '_'
          Set-Printer -Name $printerName -Shared $true -ShareName $shareName -ErrorAction Stop
          Start-Sleep -Milliseconds 500
          $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
          if ($printer.Shared) {
            Write-Output "INFO: Impresora compartida automáticamente como: $($printer.ShareName)"
          }
        } catch {
          Write-Output "WARNING: No se pudo compartir la impresora automáticamente. Puede necesitar permisos de administrador."
        }
      }
      
      # Si ahora está compartida, usar el método de red
      if ($printer.Shared) {
        $computerName = $env:COMPUTERNAME
        $shareName = $printer.ShareName
        $printerPath = "\\\\$computerName\\$shareName"
        
        try {
          $fileEscaped = $file -replace '"', '""'
          $printerPathEscaped = $printerPath -replace '"', '""'
          $cmd = 'copy /b "' + $fileEscaped + '" "' + $printerPathEscaped + '"'
          $result = cmd /c $cmd 2>&1
          if ($LASTEXITCODE -eq 0) {
            Write-Output "SUCCESS"
            exit 0
          } else {
            Write-Output "ERROR: copy /b falló con código $LASTEXITCODE: $result"
          }
        } catch {
          Write-Output "ERROR: $($_.Exception.Message)"
        }
      }
      
      # Método 3: Emular puerto LPT y usar copy /b
      # Verificar si LPT1 ya está mapeado
      $lptMapped = net use LPT1: 2>&1 | Select-String "is connected"
      
      if (-not $lptMapped) {
        # Mapear la impresora a LPT1
        $computerName = $env:COMPUTERNAME
        $shareName = if ($printer.Shared -and $printer.ShareName) { 
          $printer.ShareName 
        } else { 
          $printerName -replace '[^a-zA-Z0-9_]', '_' 
        }
        
        # Asegurar que esté compartida
        if (-not $printer.Shared) {
          try {
            Set-Printer -Name $printerName -Shared $true -ShareName $shareName -ErrorAction Stop
            Start-Sleep -Milliseconds 500
            $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
          } catch {
            Write-Output "ERROR: No se pudo compartir la impresora. Ejecuta como administrador o comparte manualmente."
            exit 1
          }
        }
        
        # Mapear a LPT1
        $mapResult = net use LPT1: "\\\\$computerName\\$shareName" /persistent:no 2>&1
        if ($LASTEXITCODE -ne 0) {
          Write-Output "ERROR: No se pudo mapear LPT1: $mapResult"
          exit 1
        }
      }
      
      # Enviar datos a LPT1 usando copy /b
      $fileEscaped = $file -replace '"', '""'
      $cmd = 'copy /b "' + $fileEscaped + '" LPT1:'
      $result = cmd /c $cmd 2>&1
      if ($LASTEXITCODE -eq 0) {
        Write-Output "SUCCESS"
        exit 0
      } else {
        Write-Output "ERROR: copy /b a LPT1 falló con código $LASTEXITCODE: $result"
        exit 1
      }
    } catch {
      Write-Output "ERROR: $($_.Exception.Message)"
      exit 1
    }
  `;
  
  const psFile = path.join(os.tmpdir(), `print-alt-${Date.now()}.ps1`);
  fs.writeFileSync(psFile, psScript, 'utf8');
  
  exec(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    setTimeout(() => {
      try {
        fs.unlinkSync(tempFile);
        fs.unlinkSync(psFile);
      } catch (e) {}
    }, 3000);
    
    if (error || stdout.includes('ERROR')) {
      const errorDetails = stdout || error?.message || stderr || 'Error desconocido';
      logger.error(`Método alternativo también falló:`, errorDetails);
      
      // Proporcionar mensaje de error más útil
      let errorMessage = `No se pudo imprimir en ${printerName}.`;
      
      if (errorDetails.includes('No se pudo compartir')) {
        errorMessage += '\n\n💡 Solución: Ejecuta PowerShell como Administrador y ejecuta:';
        errorMessage += `\n   Set-Printer -Name "${printerName}" -Shared $true -ShareName "EPSON_TM_T20III"`;
      } else if (errorDetails.includes('permisos') || errorDetails.includes('acceso')) {
        errorMessage += '\n\n💡 Solución: Comparte la impresora manualmente desde Configuración de Windows o ejecuta el agente como administrador.';
      } else {
        errorMessage += '\n\n💡 Soluciones:';
        errorMessage += '\n   1. Comparte la impresora desde Configuración de Windows';
        errorMessage += '\n   2. O ejecuta el agente como administrador';
        errorMessage += '\n   3. Verifica que la impresora esté encendida y conectada';
      }
      
      return reject(new Error(errorMessage));
    }
    
    logger.info(`Impresión enviada usando método alternativo (copy /b)`);
    resolve();
  });
}

class PrinterManager {
  constructor() {
    // Map: Es como un "diccionario" que guarda:
    // - Clave: printerId (ej: "lomiteria-001")
    // - Valor: Configuración de la impresora (dispositivo, tipo, etc.)
    // 
    // Ejemplo de lo que guarda:
    // {
    //   "lomiteria-001": { device: impresoraUSB1, config: {...} },
    //   "lomiteria-002": { device: impresoraUSB2, config: {...} },
    //   "lomiteria-003": { device: impresoraRed, config: {...} }
    // }
    this.printers = new Map();
    
    // Cargar configuraciones guardadas al iniciar
    this.loadSavedConfigurations();
    
    // Si no hay impresoras cargadas, configurar automáticamente la impresora por defecto
    if (this.printers.size === 0) {
      this.autoConfigureDefaultPrinter();
    }
  }

  /**
   * Carga las configuraciones guardadas desde el archivo
   */
  loadSavedConfigurations() {
    try {
      if (fs.existsSync(PRINTERS_CONFIG_FILE)) {
        const data = fs.readFileSync(PRINTERS_CONFIG_FILE, 'utf8');
        const savedConfigs = JSON.parse(data);
        
        logger.info(`Cargando ${Object.keys(savedConfigs).length} impresora(s) configurada(s) desde archivo`);
        
        // Restaurar cada configuración
        for (const [printerId, config] of Object.entries(savedConfigs)) {
          try {
            // Reconstruir el device según el tipo
            let device;
            if (config.type === 'network') {
              device = new network(config.ip || '192.168.1.100', config.port || 9100);
            } else {
              // USB - Windows
              if (os.platform() === 'win32') {
                device = { 
                  type: 'windows', 
                  name: config.printerName || 'EPSON TM-T20III Receipt',
                  port: config.port || 'TMUSB001'
                };
              } else {
                // Linux/Mac
                const devices = usb.findPrinter();
                device = devices && devices.length > 0 ? devices[0] : null;
              }
            }
            
            if (device) {
              this.printers.set(printerId, { device, config });
              logger.info(`Impresora restaurada: ${printerId} (${config.type})`);
            }
          } catch (error) {
            logger.warn(`Error al restaurar impresora ${printerId}:`, error.message);
          }
        }
      }
    } catch (error) {
      logger.warn('Error al cargar configuraciones guardadas:', error.message);
    }
  }

  /**
   * Configura automáticamente la impresora por defecto si no hay ninguna configurada
   */
  autoConfigureDefaultPrinter() {
    try {
      const defaultPrinterId = 'atlas-burger-printer-1';
      const defaultPrinterName = 'EPSON TM-T20III Receipt';
      
      if (os.platform() === 'win32') {
        // Verificar si la impresora existe en Windows
        try {
          const { execSync } = require('child_process');
          const printerCheck = execSync(`powershell -Command "Get-Printer -Name '${defaultPrinterName}' -ErrorAction SilentlyContinue | Select-Object -First 1"`, { encoding: 'utf8' }).trim();
          
          if (printerCheck) {
            // Obtener el puerto
            let printerPort = 'TMUSB001';
            try {
              const portInfo = execSync(`powershell -Command "Get-Printer -Name '${defaultPrinterName}' | Select-Object -ExpandProperty PortName"`, { encoding: 'utf8' }).trim();
              if (portInfo && portInfo.length > 0) {
                printerPort = portInfo;
              }
            } catch (e) {
              logger.warn(`No se pudo obtener el puerto, usando por defecto: ${printerPort}`);
            }
            
            const device = { type: 'windows', name: defaultPrinterName, port: printerPort };
            const config = {
              printerId: defaultPrinterId,
              type: 'usb',
              printerName: defaultPrinterName,
              port: printerPort
            };
            
            this.printers.set(defaultPrinterId, { device, config });
            this.saveConfigurations();
            logger.info(`✅ Impresora configurada automáticamente: ${defaultPrinterId} (${defaultPrinterName})`);
            return true;
          }
        } catch (e) {
          logger.debug(`No se pudo configurar automáticamente la impresora: ${e.message}`);
        }
      }
    } catch (error) {
      logger.warn(`Error en auto-configuración de impresora: ${error.message}`);
    }
    return false;
  }

  /**
   * Guarda las configuraciones actuales en el archivo
   */
  saveConfigurations() {
    try {
      const configsToSave = {};
      
      // Convertir Map a objeto JSON (solo guardar config, no device)
      for (const [printerId, { config }] of this.printers.entries()) {
        configsToSave[printerId] = {
          printerId: config.printerId,
          type: config.type,
          printerName: config.printerName,
          ip: config.ip,
          port: config.port,
          vendorId: config.vendorId,
          productId: config.productId
        };
      }
      
      // Guardar en archivo
      fs.writeFileSync(PRINTERS_CONFIG_FILE, JSON.stringify(configsToSave, null, 2), 'utf8');
      logger.debug(`Configuraciones guardadas: ${Object.keys(configsToSave).length} impresora(s)`);
    } catch (error) {
      logger.error('Error al guardar configuraciones:', error.message);
    }
  }

  /**
   * Obtiene o crea una conexión a la impresora
   * 
   * ¿Qué hace?
   * - Configura una nueva impresora en el agente
   * - O devuelve una impresora que ya estaba configurada
   * 
   * ¿Cómo identifica la lomitería?
   * - Usa el parámetro 'printerId' que viene en la configuración
   * - Este ID es único para cada lomitería (ej: "lomiteria-001")
   * - Lo guarda en el Map para poder buscarlo después
   * 
   * Ejemplo de uso:
   * getPrinter({
   *   printerId: "lomiteria-001",  // ← Identifica qué lomitería es
   *   type: "usb"
   * })
   * 
   * @param {Object} config - Configuración de la impresora
   * @param {string} config.printerId - ID único de la impresora (identifica la lomitería)
   * @param {string} config.type - Tipo: 'usb' o 'network'
   * @param {string} [config.ip] - IP para impresora de red
   * @param {number} [config.port] - Puerto para impresora de red (default: 9100)
   */
  getPrinter(config) {
    const { printerId, type = 'usb' } = config;

    // Si ya existe una conexión para este printerId, la reutilizamos
    // Esto evita configurar la misma impresora varias veces
    if (this.printers.has(printerId)) {
      logger.info(`Reutilizando impresora existente: ${printerId}`);
      return this.printers.get(printerId);
    }

    let device;
    
    try {
      if (type === 'network') {
        const ip = config.ip || '192.168.1.100';
        const port = config.port || 9100;
        device = new network(ip, port);
        logger.info(`Impresora de red configurada: ${ip}:${port} (ID: ${printerId})`);
      } else {
        // USB - En Windows, usar el nombre de la impresora instalada
        const printerName = config.printerName || 'EPSON TM-T20III Receipt';
        
        // En Windows, guardamos el nombre de la impresora y el puerto
        if (os.platform() === 'win32') {
          // Obtener el puerto de la impresora desde Windows
          let printerPort = 'TMUSB001'; // Puerto por defecto
          try {
            const { execSync } = require('child_process');
            const printerInfo = execSync(`powershell -Command "Get-Printer -Name '${printerName}' | Select-Object -ExpandProperty PortName"`, { encoding: 'utf8' }).trim();
            if (printerInfo) {
              printerPort = printerInfo;
            }
          } catch (e) {
            logger.warn(`No se pudo obtener el puerto, usando por defecto: ${printerPort}`);
          }
          
          device = { type: 'windows', name: printerName, port: printerPort };
          logger.info(`Impresora Windows configurada: ${printerName} (Puerto: ${printerPort}, ID: ${printerId})`);
        } else {
          // Linux/Mac: usar USB directo
          device = usb.findPrinter();
          if (!device || device.length === 0) {
            throw new Error('No se encontró ninguna impresora USB conectada');
          }
          device = device[0];
          logger.info(`Impresora USB configurada (ID: ${printerId})`);
        }
      }

      this.printers.set(printerId, { device, config });
      
      // Guardar configuración en archivo para persistencia
      this.saveConfigurations();
      
      return { device, config };
    } catch (error) {
      logger.error(`Error al configurar impresora ${printerId}:`, error);
      throw error;
    }
  }

  /**
   * Imprime un ticket
   * 
   * ¿Qué hace?
   * - Busca la impresora correcta usando el printerId
   * - Envía los datos a esa impresora específica
   * 
   * ¿Cómo identifica qué impresora usar?
   * - Usa el parámetro 'printerId' que viene de tu app web
   * - Busca en el Map de impresoras configuradas
   * - Si encuentra una con ese ID, usa esa impresora
   * - Si no la encuentra, devuelve un error
   * 
   * Ejemplo:
   * print("lomiteria-001", ticketBuffer)
   * - Busca: ¿Existe una impresora con ID "lomiteria-001"?
   * - Si existe → Imprime en esa impresora
   * - Si no existe → Error: "Impresora no encontrada"
   * 
   * @param {string} printerId - ID de la impresora (identifica qué lomitería es)
   * @param {Buffer|string} data - Datos a imprimir (comandos ESC/POS o texto)
   */
  async print(printerId, data, options = {}) {
    return new Promise((resolve, reject) => {
      // PASO 1: Buscar la impresora en la lista usando el printerId
      // El printerId identifica qué lomitería es y qué impresora usar
      const printerConfig = this.printers.get(printerId);
      
      // PASO 2: Verificar que la impresora existe
      // Si no está configurada, no podemos imprimir
      if (!printerConfig) {
        return reject(new Error(
          `Impresora ${printerId} no encontrada. ` +
          `Configúrala primero usando POST /api/printer/configure`
        ));
      }

      const { device } = printerConfig;

      // Si es Windows, usar el API de Windows para impresión RAW
      if (device.type === 'windows') {
        try {
          const printerName = device.name;
          const printData = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
          
          // Escribir a archivo temporal
          const tempFile = path.join(os.tmpdir(), `ticket-${Date.now()}.raw`);
          fs.writeFileSync(tempFile, printData);
          
          // Usar PowerShell con el API de Windows para impresión RAW (método correcto con Unicode)
          const psScript = `
            $printerName = '${printerName}'
            $file = '${tempFile}'
            
            # Código C# para el API de Windows (usando funciones Unicode)
            $csharpCode = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class RawPrinterHelper {
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
    
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
}
"@
            
            Add-Type -TypeDefinition $csharpCode
            
            # Verificar que la impresora existe
            $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
            if (-not $printer) {
              Write-Output "ERROR: Impresora no encontrada: $printerName"
              exit 1
            }
            
            # Intentar compartir la impresora si no está compartida (para mejorar compatibilidad)
            if (-not $printer.Shared) {
              try {
                $shareName = $printerName -replace '[^a-zA-Z0-9_]', '_'
                Set-Printer -Name $printerName -Shared $true -ShareName $shareName -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
                $printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
              } catch {
                # Ignorar error al compartir, continuar con el intento de impresión
              }
            }
            
            # Leer los bytes del archivo
            $bytes = [System.IO.File]::ReadAllBytes($file)
            $length = $bytes.Length
            
            # Abrir la impresora
            $hPrinter = [IntPtr]::Zero
            $opened = [RawPrinterHelper]::OpenPrinter($printer.Name, [ref]$hPrinter, [IntPtr]::Zero)
            
            if (-not $opened) {
              $errorCode = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
              # Si falla, intentar con el método alternativo
              Write-Output "ERROR: No se pudo abrir la impresora (Error: $errorCode). Intentando método alternativo..."
              exit 2
            }
            
            try {
              # Iniciar documento
              $di = New-Object RawPrinterHelper+DOCINFOW
              $di.pDocName = "Ticket"
              $di.pDataType = "RAW"
              
              $started = [RawPrinterHelper]::StartDocPrinter($hPrinter, 1, $di)
              if (-not $started) {
                Write-Output "ERROR: No se pudo iniciar el documento"
                exit 1
              }
              
              try {
                # Iniciar página
                [RawPrinterHelper]::StartPagePrinter($hPrinter) | Out-Null
                
                # Escribir datos
                $pBytes = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($length)
                [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $pBytes, $length)
                
                $written = 0
                $success = [RawPrinterHelper]::WritePrinter($hPrinter, $pBytes, $length, [ref]$written)
                
                [System.Runtime.InteropServices.Marshal]::FreeHGlobal($pBytes)
                
                if (-not $success) {
                  Write-Output "ERROR: No se pudo escribir en la impresora"
                  exit 1
                }
                
                # Finalizar página y documento
                [RawPrinterHelper]::EndPagePrinter($hPrinter) | Out-Null
                [RawPrinterHelper]::EndDocPrinter($hPrinter) | Out-Null
                
                Write-Output "SUCCESS"
              } catch {
                [RawPrinterHelper]::EndDocPrinter($hPrinter) | Out-Null
                Write-Output "ERROR: $($_.Exception.Message)"
                exit 1
              }
            } finally {
              [RawPrinterHelper]::ClosePrinter($hPrinter) | Out-Null
            }
          `;
          
          const psFile = path.join(os.tmpdir(), `print-${Date.now()}.ps1`);
          fs.writeFileSync(psFile, psScript, 'utf8');
          
          exec(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            // Limpiar archivos temporales
            setTimeout(() => {
              try {
                fs.unlinkSync(tempFile);
                fs.unlinkSync(psFile);
              } catch (e) {}
            }, 3000);
            
            if (error || stdout.includes('ERROR')) {
              const errorMsg = stdout.includes('ERROR') ? stdout : (error?.message || stderr || 'Error desconocido');
              logger.warn(`Error con API de Windows, intentando método alternativo:`, errorMsg);
              // Intentar método alternativo
              return tryAlternativePrintMethod(printerName, printData, resolve, reject);
            }
            
            logger.info(`Impresión enviada a ${printerName}`);
            resolve();
          });
        } catch (err) {
          logger.error(`Error durante la impresión en ${printerId}:`, err);
          reject(err);
        }
      } else {
        // Linux/Mac: usar escpos normal
        device.open((error) => {
          if (error) {
            logger.error(`Error al abrir impresora ${printerId}:`, error);
            return reject(error);
          }

          try {
            const printer = new escpos.Printer(device);

            // Si data es un Buffer (comandos ESC/POS ya formateados), lo enviamos directamente
            if (Buffer.isBuffer(data)) {
              device.write(data, (err) => {
                if (err) {
                  logger.error(`Error al escribir en impresora ${printerId}:`, err);
                  device.close();
                  return reject(err);
                }
                
                // Cortar papel y cerrar
                printer.cut().close();
                logger.info(`Impresión completada para ${printerId}`);
                resolve();
              });
            } else {
              // Si es texto, lo formateamos con ESC/POS
              printer
                .encode('CP850') // Codificación para caracteres especiales (español)
                .text(data)
                .feed(2)
                .cut()
                .close();
              
              logger.info(`Impresión completada para ${printerId}`);
              resolve();
            }
          } catch (err) {
            logger.error(`Error durante la impresión en ${printerId}:`, err);
            device.close();
            reject(err);
          }
        });
      }
    });
  }

  /**
   * Lista todas las impresoras USB disponibles
   */
  async listUSBPrinters() {
    try {
      // En Windows, usar PowerShell para obtener las impresoras instaladas
      if (os.platform() === 'win32') {
        return new Promise((resolve, reject) => {
          const { exec } = require('child_process');
          // Comando mejorado: obtener TODAS las impresoras sin filtrar por estado
          // Usar -ErrorAction SilentlyContinue para evitar errores si no hay impresoras
          const command = `powershell -ExecutionPolicy Bypass -Command "Get-Printer -ErrorAction SilentlyContinue | Select-Object Name, PortName, DriverName, PrinterStatus | ConvertTo-Json -Depth 3"`;
          
          logger.info('Ejecutando comando PowerShell para listar impresoras...');
          
          exec(command, { 
            encoding: 'utf8', 
            maxBuffer: 1024 * 1024,
            timeout: 10000 // 10 segundos de timeout
          }, (error, stdout, stderr) => {
            // Log de debug
            if (stderr && stderr.trim()) {
              logger.warn('Stderr de PowerShell:', stderr);
            }
            
            if (error) {
              logger.error('Error al ejecutar PowerShell:', error.message);
              logger.error('Código de error:', error.code);
              // Si falla PowerShell, intentar con usb.findPrinter() como fallback
              try {
                logger.info('Intentando método alternativo con usb.findPrinter()...');
                const devices = usb.findPrinter();
                logger.info(`Método alternativo encontró ${devices ? devices.length : 0} dispositivos`);
                resolve(devices || []);
              } catch (usbError) {
                logger.error('Error al listar impresoras USB con método alternativo:', usbError);
                resolve([]); // Devolver array vacío en lugar de lanzar error
              }
              return;
            }

            try {
              const output = stdout.trim();
              logger.debug('Salida de PowerShell (primeros 500 chars):', output.substring(0, 500));
              
              if (!output || output === '') {
                logger.warn('PowerShell no devolvió ninguna salida');
                resolve([]);
                return;
              }

              // PowerShell puede devolver un objeto o un array
              let printers;
              try {
                printers = JSON.parse(output);
                logger.debug('JSON parseado exitosamente');
              } catch (parseError) {
                logger.error('Error al parsear JSON de PowerShell:', parseError.message);
                logger.error('Salida completa:', output);
                // Intentar método alternativo
                try {
                  const devices = usb.findPrinter();
                  logger.info(`Método alternativo encontró ${devices ? devices.length : 0} dispositivos`);
                  resolve(devices || []);
                } catch (usbError) {
                  resolve([]);
                }
                return;
              }

              // Si es un solo objeto, convertirlo a array
              if (!Array.isArray(printers)) {
                printers = [printers];
              }

              logger.info(`PowerShell encontró ${printers.length} impresora(s)`);

              // Formatear las impresoras para que tengan un formato consistente
              // Filtrar impresoras virtuales comunes (PDF, Fax, etc.)
              const virtualPrinters = ['Microsoft Print to PDF', 'Fax', 'OneNote', 'XPS', 'Send To OneNote'];
              const formattedPrinters = printers
                .filter(p => {
                  if (!p || !p.Name) return false;
                  // Filtrar impresoras virtuales
                  const isVirtual = virtualPrinters.some(vp => p.Name.includes(vp));
                  if (isVirtual) {
                    logger.debug(`Filtrando impresora virtual: ${p.Name}`);
                    return false;
                  }
                  return true;
                })
                .map(printer => {
                  const formatted = {
                    name: printer.Name,
                    portName: printer.PortName || 'USB',
                    displayName: `${printer.Name}${printer.DriverName ? ` (${printer.DriverName})` : ''}`,
                    driverName: printer.DriverName || '',
                    address: printer.PortName || '',
                    path: printer.PortName || '',
                    status: printer.PrinterStatus || 'Unknown'
                  };
                  logger.debug(`Impresora formateada: ${formatted.name} - Puerto: ${formatted.portName}`);
                  return formatted;
                });

              logger.info(`Impresoras encontradas y formateadas: ${formattedPrinters.length}`);
              if (formattedPrinters.length > 0) {
                logger.info('Impresoras:', formattedPrinters.map(p => p.name).join(', '));
              }
              
              resolve(formattedPrinters);
            } catch (parseError) {
              logger.error('Error al procesar impresoras de PowerShell:', parseError);
              logger.error('Stack trace:', parseError.stack);
              resolve([]);
            }
          });
        });
      } else {
        // Linux/Mac: usar usb.findPrinter()
        const devices = usb.findPrinter();
        return devices || [];
      }
    } catch (error) {
      logger.error('Error al listar impresoras USB:', error);
      logger.error('Stack trace:', error.stack);
      return []; // Devolver array vacío en lugar de lanzar error
    }
  }

  /**
   * Elimina una impresora de la configuración
   */
  removePrinter(printerId) {
    const printerConfig = this.printers.get(printerId);
    if (printerConfig) {
      try {
        printerConfig.device.close();
      } catch (err) {
        logger.warn(`Error al cerrar impresora ${printerId}:`, err);
      }
      this.printers.delete(printerId);
      logger.info(`Impresora ${printerId} eliminada`);
    }
  }
}

module.exports = new PrinterManager();

