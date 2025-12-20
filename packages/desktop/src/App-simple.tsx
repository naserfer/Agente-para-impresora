// Versión simple para debugging
import React from 'react';

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>✅ Interfaz Gráfica Cargada</h1>
      <p>Si ves esto, React está funcionando correctamente.</p>
      <p>ElectronAPI disponible: {typeof window !== 'undefined' && window.electronAPI ? '✅ Sí' : '❌ No'}</p>
    </div>
  );
}

export default App;




