# Test de codificación - Ver exactamente qué bytes se envían
$printerName = "EPSON TM-T20III Receipt"

# Crear datos de prueba con diferentes caracteres
$esc = [char]27
$testStrings = @(
    "TEST 1: Caracteres basicos",
    "TEST 2: Acentos: a e i o u",
    "TEST 3: N y n",
    "TEST 4: Separadores: ================",
    "TEST 5: Separadores: ----------------",
    "TEST 6: Separadores: ================",
    "TEST 7: Simbolos: !@#`$%^&*()",
    "TEST 8: Numeros: 1234567890"
)

Write-Host "Generando comandos ESC/POS de prueba..." -ForegroundColor Cyan

# Código C# para el API de Windows
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

# Verificar impresora
$printer = Get-Printer -Name $printerName -ErrorAction SilentlyContinue
if (-not $printer) {
    Write-Host "ERROR: Impresora no encontrada" -ForegroundColor Red
    exit 1
}

# Abrir impresora
$hPrinter = [IntPtr]::Zero
$opened = [RawPrinterHelper]::OpenPrinter($printer.Name, [ref]$hPrinter, [IntPtr]::Zero)

if (-not $opened) {
    Write-Host "ERROR: No se pudo abrir la impresora" -ForegroundColor Red
    exit 1
}

try {
    # Iniciar documento
    $di = New-Object RawPrinterHelper+DOCINFOW
    $di.pDocName = "Encoding Test"
    $di.pDataType = "RAW"
    
    [RawPrinterHelper]::StartDocPrinter($hPrinter, 1, $di) | Out-Null
    [RawPrinterHelper]::StartPagePrinter($hPrinter) | Out-Null
    
    # Comando ESC @ (Inicializar impresora)
    $init = [byte[]]($esc, 64)
    
    # Comando ESC t 0 (Seleccionar tabla de caracteres: PC437)
    $charset437 = [byte[]]($esc, 116, 0)
    
    # Comando ESC t 1 (Seleccionar tabla de caracteres: Katakana)
    $charset850 = [byte[]]($esc, 116, 1)  # CP850
    
    # Comando ESC t 2 (Seleccionar tabla de caracteres: PC850)
    $charset850_alt = [byte[]]($esc, 116, 2)
    
    # Probar con CP850
    Write-Host "Enviando con CP850 (ESC t 1)..." -ForegroundColor Yellow
    $allBytes = New-Object System.Collections.ArrayList
    
    # Inicializar
    $allBytes.AddRange($init)
    $allBytes.AddRange($charset850)
    
    # Agregar cada string de prueba
    foreach ($testStr in $testStrings) {
        Write-Host "  - $testStr" -ForegroundColor Gray
        
        # Convertir a CP850
        $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($testStr)
        $cp850Bytes = [System.Text.Encoding]::GetEncoding(850).GetBytes($testStr)
        
        # Mostrar bytes en hex para debug
        $hex = ($cp850Bytes | ForEach-Object { $_.ToString("X2") }) -join " "
        Write-Host "    Bytes (hex): $hex" -ForegroundColor DarkGray
        
        $allBytes.AddRange($cp850Bytes)
        $allBytes.AddRange([byte[]](13, 10))  # CRLF
    }
    
    # Cortar papel
    $cut = [byte[]]($esc, 105)
    $allBytes.AddRange($cut)
    
    # Enviar
    $bytes = $allBytes.ToArray()
    $pBytes = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $pBytes, $bytes.Length)
    
    $written = 0
    $success = [RawPrinterHelper]::WritePrinter($hPrinter, $pBytes, $bytes.Length, [ref]$written)
    
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($pBytes)
    
    [RawPrinterHelper]::EndPagePrinter($hPrinter) | Out-Null
    [RawPrinterHelper]::EndDocPrinter($hPrinter) | Out-Null
    
    if ($success) {
        Write-Host "SUCCESS: Test enviado ($written bytes)" -ForegroundColor Green
        Write-Host "Revisa la impresora para ver qué caracteres se muestran correctamente" -ForegroundColor Yellow
    } else {
        Write-Host "ERROR: No se pudo escribir" -ForegroundColor Red
    }
} finally {
    [RawPrinterHelper]::ClosePrinter($hPrinter) | Out-Null
}

