/**
 * useFallbackSignaling Hook
 *
 * React hook для управления fallback сигналингом с несколькими методами подключения.
 *
 * @version 1.0.0
 */

import { useCallback, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { logger } from '../utils/logger';
import {
  FallbackSignalingManager,
  SignalingMethod,
  SignalingResult,
} from '../utils/fallbackSignaling';

// Type for Trystero room (since library doesn't export types)
type TrysteroRoom = {
  send: (data: any) => void;
  onData: (callback: (data: any, peerId: string) => void) => () => void;
  onPeerJoin: (callback: (peerId: string) => void) => () => void;
  onPeerLeave: (callback: (peerId: string) => void) => () => void;
  leave: () => void;
  getPeers: () => string[];
};

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface UseFallbackSignalingReturn {
  // Состояние
  connectionStatus: ConnectionStatus;
  currentMethod: SignalingMethod | null;
  peerId: string | null;
  isHost: boolean;

  // PeerJS (для обратной совместимости)
  peerRef: React.RefObject<Peer | null>;
  connectionRef: React.RefObject<any>;
  connectionsRef: React.RefObject<any[]>;

  // Trystero
  roomRef: React.RefObject<TrysteroRoom | null>;

  // Методы подключения
  connectAsHost: () => Promise<SignalingResult>;
  connectAsGuest: (hostId: string, playerName: string) => Promise<SignalingResult>;

  // Утилиты
  disconnect: () => void;
  getAvailableMethods: () => ReturnType<FallbackSignalingManager['getAvailableMethods']>;
  getCurrentMethodName: () => string;
}

/**
 * Hook для управления fallback сигналингом
 */
export function useFallbackSignaling(): UseFallbackSignalingReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [currentMethod, setCurrentMethod] = useState<SignalingMethod | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);

  // Refs для хранения соединений
  const peerRef = useRef<Peer | null>(null);
  const connectionRef = useRef<any>(null); // Guest -> Host connection
  const connectionsRef = useRef<any[]>([]); // Host -> Guest connections
  const roomRef = useRef<TrysteroRoom | null>(null); // Trystero room

  const managerRef = useRef<FallbackSignalingManager | null>(null);

  /**
   * Очистить все активные соединения
   */
  const disconnect = useCallback(() => {
    logger.info('[Connect] Disconnecting...');

    // Закрыть PeerJS peer
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
      peerRef.current = null;
    }

    // Закрыть PeerJS соединения
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }

    connectionsRef.current.forEach((conn) => conn.close());
    connectionsRef.current = [];

    // Закрыть Trystero room
    if (roomRef.current) {
      roomRef.current.leave();
      roomRef.current = null;
    }

    setConnectionStatus('disconnected');
    setCurrentMethod(null);
    setPeerId(null);
    setIsHost(false);
  }, []);

  /**
   * Подключиться как хост
   */
  const connectAsHost = useCallback(async (): Promise<SignalingResult> => {
    logger.info('[Connect] Connecting as host...');
    setConnectionStatus('connecting');
    setIsHost(true);

    // Отключаем предыдущие соединения
    disconnect();

    if (!managerRef.current) {
      managerRef.current = new FallbackSignalingManager({
        onMethodAttempt: (method) => {
          logger.info(`[Connect] Attempting method: ${method}`);
          setCurrentMethod(method);
        },
        onMethodSuccess: (result) => {
          logger.info(`[Connect] Success with method: ${result.method}`);
          setConnectionStatus('connected');

          // Сохраняем ссылки на соединения
          if (result.peer) {
            peerRef.current = result.peer;
            setPeerId(result.peer.id);
          }
          if (result.room) {
            roomRef.current = result.room;
          }
        },
        onMethodFailure: (method, error) => {
          logger.warn(`[Connect] Method ${method} failed:`, error);
        },
        onAllFailed: () => {
          logger.error('[Connect] All connection methods failed');
          setConnectionStatus('disconnected');
          setCurrentMethod(null);
        },
      });
    }

    const result = await managerRef.current.connectAsHost();

    if (result.success && result.peer) {
      // Настроим обработчик входящих соединений для PeerJS
      result.peer.on('connection', (conn: any) => {
        logger.info(`[Connect] Incoming connection from: ${conn.peer}`);
        connectionsRef.current.push(conn);

        conn.on('close', () => {
          logger.warn(`[Connect] Guest ${conn.peer} disconnected`);
          connectionsRef.current = connectionsRef.current.filter((c) => c !== conn);
        });
      });
    }

    return result;
  }, [disconnect]);

  /**
   * Подключиться как гость
   */
  const connectAsGuest = useCallback(
    async (hostId: string, playerName: string): Promise<SignalingResult> => {
      logger.info(`[Connect] Connecting as guest to: ${hostId}`);
      setConnectionStatus('connecting');
      setIsHost(false);

      // Отключаем предыдущие соединения
      disconnect();

      if (!managerRef.current) {
        managerRef.current = new FallbackSignalingManager({
          onMethodAttempt: (method) => {
            logger.info(`[Connect] Attempting method: ${method}`);
            setCurrentMethod(method);
          },
          onMethodSuccess: (result) => {
            logger.info(`[Connect] Success with method: ${result.method}`);
            setConnectionStatus('connected');

            // Сохраняем ссылки на соединения
            if (result.peer) {
              peerRef.current = result.peer;
              setPeerId(result.peer.id);
            }
            if (result.connection) {
              connectionRef.current = result.connection;
            }
            if (result.room) {
              roomRef.current = result.room;
            }
          },
          onMethodFailure: (method, error) => {
            logger.warn(`[Connect] Method ${method} failed:`, error);
          },
          onAllFailed: () => {
            logger.error('[Connect] All connection methods failed');
            setConnectionStatus('disconnected');
            setCurrentMethod(null);
          },
        });
      }

      const result = await managerRef.current.connectAsGuest(hostId, playerName);

      return result;
    },
    [disconnect]
  );

  /**
   * Получить список доступных методов
   */
  const getAvailableMethods = useCallback(() => {
    if (!managerRef.current) {
      return [];
    }
    return managerRef.current.getAvailableMethods();
  }, []);

  /**
   * Получить название текущего метода
   */
  const getCurrentMethodName = useCallback((): string => {
    const methods = getAvailableMethods();
    const current = methods.find((m) => m.method === currentMethod);
    return current?.name || 'None';
  }, [currentMethod, getAvailableMethods]);

  return {
    // Состояние
    connectionStatus,
    currentMethod,
    peerId,
    isHost,

    // Refs
    peerRef,
    connectionRef,
    connectionsRef,
    roomRef,

    // Методы
    connectAsHost,
    connectAsGuest,
    disconnect,

    // Утилиты
    getAvailableMethods,
    getCurrentMethodName,
  };
}

export default useFallbackSignaling;
