import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({command, mode}) => {
  const endpoint = loadEnv(mode, process.cwd(), 'VITE_').VITE_SERVER_URL?.trim();
  if (command === 'build' && mode === 'production' && !endpoint) {
    throw new Error('Set VITE_SERVER_URL to the HTTPS game server origin before building for production');
  }
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.origin !== endpoint || !['http:', 'https:'].includes(url.protocol)
      || (mode === 'production' && url.protocol !== 'https:')) {
      throw new Error('VITE_SERVER_URL must be a bare HTTP(S) origin (HTTPS in production)');
    }
  }
  return {plugins:[react()]};
});
