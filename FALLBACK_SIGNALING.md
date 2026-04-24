# Fallback Signaling System

Система автоматического переключения между методами WebRTC сигналинга для NexusGameTable.

## Порядок подключения

При попытке подключения система пробует методы в следующем порядке:

1. **PeerJS Cloud Servers** (основной метод)
   - `0.peerjs.com` - Primary
   - `1.peerjs.com` - Secondary
   - `2.peerjs.com` - Tertiary

2. **Community Servers** (self-hosted опции)
   - Добавьте свои сервера в `COMMUNITY_SERVERS` в `usePeerConnection.ts`

3. **Trystero Torrent Trackers** (fallback)
   - `wss://tracker.btorrent.xyz`
   - `wss://tracker.openwebtorrent.com`
   - `wss://tracker.fastcast.nz`
   - `wss://tracker.files.fm:443/announce`

## Добавление комьюнити сервера

Для добавления self-hosted PeerJS сервера:

```typescript
// В store/usePeerConnection.ts

const COMMUNITY_SERVERS = [
  {
    host: 'your-server.com',
    port: 443,
    secure: true,
    path: '/peerjs',
    name: 'My Server'
  },
];
```

## Деплой своего PeerJS сервера

### Быстрый старт (Heroku/Railway/Render)

```bash
# 1. Создайте папку для сервера
mkdir nexus-signaling && cd nexus-signaling

# 2. Инициализируйте проект
npm init -y
npm install peer

# 3. Создайте server.js
cat > server.js << 'EOF'
const { PeerServer } = require('peer');

const peerServer = PeerServer({
  port: process.env.PORT || 443,
  path: '/peerjs',
});

peerServer.on('connection', (client) => {
  console.log(`Client connected: ${client.getId()}`);
});

console.log('PeerJS server running');
EOF

# 4. Добавьте Procfile для Heroku
echo "web: node server.js" > Procfile

# 5. Задеплойте
heroku create your-signaling-server
git push heroku main
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
RUN npm install -g peer
EXPOSE 443
CMD ["peerjs", "--port", "443", "--path", "/peerjs"]
```

## Мониторинг

В консоли браузера можно видеть статус подключения:

```
[Fallback] 🔄 Starting fallback connection sequence...
[Fallback] Attempting PeerJS Cloud Primary (0.peerjs.com)...
[Fallback] ❌ PeerJS Cloud Primary failed, trying next...
[Fallback] Attempting PeerJS Cloud Secondary (1.peerjs.com)...
[Fallback] ✅ Connected via PeerJS Cloud Secondary
```

## Диагностика

```javascript
// В консоли браузера
nexusP2PDebug.getDiagnostics();
```

## Файлы

- `store/usePeerConnection.ts` - Основной hook с fallback логикой
- `utils/fallbackSignaling.ts` - Менеджер fallback сигналинга
- `store/useFallbackSignaling.ts` - Альтернативный hook
- `types/trystero.d.ts` - TypeScript типы для Trystero
