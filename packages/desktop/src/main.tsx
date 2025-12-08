import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

console.log('🚀 main.tsx cargando...');
console.log('window disponible:', typeof window !== 'undefined');
console.log('electronAPI disponible:', typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined');

// Verificar que el elemento root existe
const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('❌ No se encontró el elemento root');
  throw new Error('No se encontró el elemento root');
}

console.log('✅ Elemento root encontrado');

// Verificar que electronAPI esté disponible
if (typeof window !== 'undefined' && !window.electronAPI) {
  console.warn('⚠️ window.electronAPI no está disponible. Algunas funciones pueden no funcionar.');
} else {
  console.log('✅ window.electronAPI disponible');
}

console.log('🔄 Renderizando App...');

try {
ReactDOM.createRoot(rootElement).render(
  <App />
);
  console.log('✅ App renderizada exitosamente');
} catch (error) {
  console.error('❌ Error renderizando App:', error);
  throw error;
}
