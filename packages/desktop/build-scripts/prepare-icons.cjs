/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');

async function main() {
  const root = path.join(__dirname, '..');
  const assetsDir = path.join(root, 'assets');
  const pngPath = path.join(assetsDir, 'icon.png');
  const icoPath = path.join(assetsDir, 'icon.ico');

  if (!fs.existsSync(assetsDir)) {
    console.warn('[prepare-icons] assets/ no existe, omitiendo');
    return;
  }
  if (!fs.existsSync(pngPath)) {
    console.warn('[prepare-icons] assets/icon.png no existe, omitiendo');
    return;
  }
  if (fs.existsSync(icoPath)) {
    return;
  }

  let pngToIco;
  try {
    pngToIco = require('png-to-ico');
  } catch (e) {
    console.warn('[prepare-icons] png-to-ico no instalado, omitiendo');
    return;
  }

  const pngBuf = fs.readFileSync(pngPath);
  const icoBuf = await pngToIco(pngBuf);
  fs.writeFileSync(icoPath, icoBuf);
  console.log('[prepare-icons] ✅ Generado assets/icon.ico');
}

main().catch((e) => {
  console.warn('[prepare-icons] ⚠️ Error generando icon.ico:', e && e.message ? e.message : String(e));
  process.exitCode = 0; // no romper el build por iconos
});

