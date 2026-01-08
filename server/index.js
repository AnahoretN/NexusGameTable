import { WebSocketServer } from 'ws';

// This server will be embedded in Vite dev server
let wss;

export function createWebSocketServer(httpServer) {
  wss = new WebSocketServer({ noServer: true });

  // Game rooms management
  const rooms = new Map();
  // clientId -> { ws, roomId, playerId, playerName, isHost }
  const clients = new Map();

  function getRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        hostId: null,
        players: new Map(),
        gameState: null,
      });
    }
    return rooms.get(roomId);
  }

  function broadcastToRoom(roomId, message, excludeClient = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.players.forEach((playerId, clientId) => {
      if (clientId !== excludeClient) {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === 1) {
          client.ws.send(JSON.stringify(message));
        }
      }
    });
  }

  function sendToClient(clientId, message) {
    const client = clients.get(clientId);
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  }

  // Handle WebSocket upgrade
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/ws')) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const clientId = crypto.randomUUID();
    let clientInfo = null;

    console.log(`🔌 New connection: ${clientId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`[${clientId.slice(0, 8)}] ${message.type}`);

        switch (message.type) {
          case 'CREATE_ROOM': {
            const roomId = message.roomId || crypto.randomUUID().slice(0, 8);
            const room = getRoom(roomId);
            room.hostId = clientId;

            clientInfo = {
              ws,
              roomId,
              playerId: clientId,
              playerName: message.playerName || 'Host',
              isHost: true,
            };
            clients.set(clientId, clientInfo);
            room.players.set(clientId, clientId);

            console.log(`🏠 Room created: ${roomId} by ${clientInfo.playerName}`);

            sendToClient(clientId, {
              type: 'ROOM_CREATED',
              roomId,
              playerId: clientId,
              isHost: true,
            });
            break;
          }

          case 'JOIN_ROOM': {
            const { roomId, playerName } = message;
            const room = rooms.get(roomId);

            if (!room) {
              sendToClient(clientId, {
                type: 'ERROR',
                error: 'Room not found',
              });
              break;
            }

            clientInfo = {
              ws,
              roomId,
              playerId: clientId,
              playerName: playerName || 'Player',
              isHost: false,
            };
            clients.set(clientId, clientInfo);
            room.players.set(clientId, clientId);

            console.log(`👤 ${clientInfo.playerName} joined room ${roomId}`);

            // Notify the joining player
            sendToClient(clientId, {
              type: 'ROOM_JOINED',
              roomId,
              playerId: clientId,
              isHost: false,
              hostId: room.hostId,
              gameState: room.gameState,
            });

            // Notify host about new player
            sendToClient(room.hostId, {
              type: 'PLAYER_JOINED',
              playerId: clientId,
              playerName: clientInfo.playerName,
            });

            // Broadcast updated player list to all
            broadcastToRoom(roomId, {
              type: 'PLAYER_LIST',
              players: Array.from(room.players.values()).map(pid => {
                const c = clients.get(pid);
                return {
                  id: pid,
                  name: c?.playerName || 'Unknown',
                  isHost: room.hostId === pid,
                };
              }),
            });
            break;
          }

          case 'GAME_STATE_UPDATE': {
            if (clientInfo && clientInfo.isHost) {
              const room = getRoom(clientInfo.roomId);
              room.gameState = message.state;

              // Broadcast to all other players
              broadcastToRoom(clientInfo.roomId, {
                type: 'SYNC_STATE',
                state: message.state,
              }, clientId);
            }
            break;
          }

          case 'GAME_ACTION': {
            if (clientInfo && !clientInfo.isHost) {
              // Guest sends action to host
              const room = getRoom(clientInfo.roomId);
              if (room && room.hostId) {
                sendToClient(room.hostId, {
                  type: 'PLAYER_ACTION',
                  action: message.action,
                  senderId: clientId,
                });
              }
            }
            break;
          }

          case 'CHAT_MESSAGE': {
            if (clientInfo) {
              broadcastToRoom(clientInfo.roomId, {
                type: 'CHAT_MESSAGE',
                senderId: clientId,
                senderName: clientInfo.playerName,
                message: message.message,
                timestamp: Date.now(),
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });

    ws.on('close', () => {
      console.log(`❌ Disconnected: ${clientId.slice(0, 8)}`);

      if (clientInfo) {
        const room = rooms.get(clientInfo.roomId);
        if (room) {
          room.players.delete(clientId);

          // Notify others
          broadcastToRoom(clientInfo.roomId, {
            type: 'PLAYER_LEFT',
            playerId: clientId,
          });

          // If host left, assign new host or close room
          if (room.hostId === clientId) {
            const remainingPlayers = Array.from(room.players.values());
            if (remainingPlayers.length > 0) {
              room.hostId = remainingPlayers[0];
              sendToClient(room.hostId, {
                type: 'BECAME_HOST',
              });
            } else {
              rooms.delete(clientInfo.roomId);
              console.log(`🏠 Room closed: ${clientInfo.roomId}`);
            }
          }
        }

        clients.delete(clientId);
      }
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error:`, err);
    });
  });

  console.log(`\n🎮 Nexus Table Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 WebSocket: ws://localhost:5173/ws`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return { wss, clients, rooms };
}

export { wss };
