; Script NSIS personalizado para optimizar compresión
; Nota: electron-builder ya maneja la compresión del paquete (7z)
; Este script solo optimiza la compresión del instalador NSIS mismo

; Solo configurar si no está en modo "whole compression" (que electron-builder usa)
; Verificar si ya hay compresión configurada antes de aplicar
!ifndef COMPRESS
  ; Configurar compresor LZMA con solid compression
  ; /SOLID comprime todos los archivos como un bloque único, mucho más eficiente para muchos archivos pequeños
  SetCompressor /SOLID lzma
  
  ; Configurar tamaño del diccionario LZMA (16 MB - buen balance entre compresión y memoria)
  SetCompressorDictSize 16
  
  ; Habilitar optimización del bloque de datos
  SetDatablockOptimize on
!endif

