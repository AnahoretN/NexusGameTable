import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ViteDevServer } from 'vite';
import { readFileSync } from 'fs';

// Read package.json for version
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Plugin to run the WebSocket server alongside Vite
function serverPlugin() {
  return {
    name: 'websocket-server',
    configureServer(server: ViteDevServer) {
      // Import and start the WebSocket server
      import('./server/index.js' as any).then(({ createWebSocketServer }: any) => {
        createWebSocketServer(server.httpServer!);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serverPlugin()],
  define: {
    'process.env': {},
    // Expose package.json version as env variable (with 't' suffix for tunnels)
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(`v${pkg.version}t`),
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
