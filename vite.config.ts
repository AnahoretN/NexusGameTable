import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Plugin to run the WebSocket server alongside Vite
function serverPlugin() {
  return {
    name: 'websocket-server',
    configureServer(server) {
      // Import and start the WebSocket server
      import('./server/index.js').then(({ createWebSocketServer }) => {
        createWebSocketServer(server.httpServer);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serverPlugin()],
  define: {
    'process.env': {}
  },
  base: '/NexusGameTable/', // GitHub Pages repository name
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
