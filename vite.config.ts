import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  // Discover worker-only dependencies up front; otherwise the first CAD import
  // triggers a Vite optimization reload and discards an in-memory job.
  optimizeDeps: { include: ['dxf-parser', 'replicad'], exclude: ['replicad-opencascadejs'] },
});
