import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, '../src/renderer'),
  base: './',
  server: {
    port: 5175,
    strictPort: true,
  },
  build: {
    outDir: path.join(__dirname, '../dist/renderer'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@renderer': path.join(__dirname, '../src/renderer'),
      '@shared': path.join(__dirname, '../src/shared'),
    },
  },
});
