import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      // Proxy WebSocket connections to the backend
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      // Proxy API calls to the backend
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
