/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  // Relative base so the build works from any static host sub-path (GitHub Pages, artifact hosting, etc.).
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
