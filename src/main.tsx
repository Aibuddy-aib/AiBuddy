import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './App.tsx';
import './index.css';
import 'uplot/dist/uPlot.min.css';
import 'react-toastify/dist/ReactToastify.css';
import ConvexClientProvider from './components/ConvexClientProvider.tsx';

// global polyfill for crypto.randomUUID()
if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
  // create a compatible crypto.randomUUID implementation
  const generateUUIDv4 = (): `${string}-${string}-${string}-${string}-${string}` => {
    const chars = '0123456789abcdef';
    const uuid = new Array(36);
    
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        uuid[i] = '-';
      } else if (i === 14) {
        uuid[i] = '4';
      } else if (i === 19) {
        uuid[i] = chars[(Math.random() * 4) | 8];
      } else {
        uuid[i] = chars[(Math.random() * 16) | 0];
      }
    }
    
    return uuid.join('') as `${string}-${string}-${string}-${string}-${string}`;
  };
  
  if (typeof crypto === 'undefined') {
    (window as any).crypto = {
      randomUUID: generateUUIDv4,
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(Math.random() * 256);
        }
        return array;
      }
    };
  } else {
    crypto.randomUUID = generateUUIDv4;
  }
}

// test crypto polyfill in development environment
if (import.meta.env.DEV) {
  console.log('Crypto polyfill initialized');
  try {
    const testUuid = crypto.randomUUID();
    console.log('Crypto.randomUUID test:', testUuid);
  } catch (error) {
    console.error('Crypto polyfill test failed:', error);
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexClientProvider>
      <Home />
    </ConvexClientProvider>
  </React.StrictMode>,
);