import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';

// Puerto del servidor de desarrollo (default: 5173)
const VITE_PORT = parseInt(process.env.VITE_PORT || '5173', 10);

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.js',
      },
      preload: {
        input: 'electron/preload.js',
      },
    }),
  ],
  server: {
    port: VITE_PORT,
    strictPort: false, // Si el puerto está ocupado, intenta el siguiente
  },
});

