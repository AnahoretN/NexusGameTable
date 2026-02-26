import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-ignore - vite.config runs in Node.js context
import { readFileSync } from 'fs';

// Read package.json for version
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
    // Expose package.json version as env variable
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.APP_NAME': JSON.stringify(pkg.name.replace(/^nexus-/, 'Nexus ').replace(/-/, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())),
  },
  base: './',
  server: {
    port: 5177,
    host: true,
    strictPort: true,
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
});
