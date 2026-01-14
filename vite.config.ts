import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ViteDevServer } from 'vite';

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
    'process.env': {}
  },
  base: '/',
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
