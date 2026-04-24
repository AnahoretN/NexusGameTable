/**
 * Fallback Signaling Manager
 *
 * Управляет несколькими методами WebRTC сигналинга с автоматическим переключением.
 *
 * Порядок попыток подключения:
 * 1. PeerJS Cloud серверы (несколько узлов)
 * 2. Комьюнити серверы (self-hosted опции)
 * 3. Trystero с торрент-трекерами
 *
 * @version 1.0.0
 */

import { Peer } from 'peerjs';
import { joinRoom } from 'trystero';
import { logger } from './logger';

// Type for Trystero room (since library doesn't export types)
type TrysteroRoom = {
  send: (data: any) => void;
  onData: (callback: (data: any, peerId: string) => void) => () => void;
  onPeerJoin: (callback: (peerId: string) => void) => () => void;
  onPeerLeave: (callback: (peerId: string) => void) => () => void;
  leave: () => void;
  getPeers: () => string[];
};

// ============================================================================
// TYPES
// ============================================================================

export type SignalingMethod = 'peerjs-cloud' | 'peerjs-community' | 'trystero-torrent';

export interface SignalingConfig {
  method: SignalingMethod;
  priority: number;
  name: string;
}

export interface SignalingResult {
  method: SignalingMethod;
  success: boolean;
  peer?: any;
  room?: TrysteroRoom;
  connection?: any;
  error?: string;
}

export interface FallbackCallbacks {
  onMethodAttempt?: (method: SignalingMethod) => void;
  onMethodSuccess?: (result: SignalingResult) => void;
  onMethodFailure?: (method: SignalingMethod, error: any) => void;
  onAllFailed?: () => void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * PeerJS Cloud серверы (официальные)
 */
const PEERJS_CLOUD_SERVERS = [
  { host: '0.peerjs.com', port: 443, secure: true },
  { host: '1.peerjs.com', port: 443, secure: true },
  { host: '2.peerjs.com', port: 443, secure: true },
];

/**
 * Комьюнити серверы (self-hosted опции)
 * Пользователи могут добавить свои сервера здесь
 */
const COMMUNITY_SERVERS = [
  // Добавьте ваши self-hosted PeerJS серверы здесь:
  // { host: 'your-server.com', port: 443, secure: true, path: '/peerjs' },

  // Примеры бесплатных хостингов (требует деплоя своего сервера):
  // { host: 'nexus-signaling-1.herokuapp.com', port: 443, secure: true },
  // { host: 'nexus-signaling-2.onrender.com', port: 443, secure: true },
];

/**
 * WebTorrent трекеры для Trystero
 */
const TORRENT_TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.fastcast.nz',
  'wss://tracker.files.fm:443/announce',
];

/**
 * Конфигурация всех методов сигналинга в порядке приоритета
 */
const SIGNALING_CONFIGS: SignalingConfig[] = [
  // Приоритет 1: PeerJS Cloud (официальные серверы)
  ...PEERJS_CLOUD_SERVERS.map((config, index) => ({
    method: 'peerjs-cloud' as SignalingMethod,
    priority: 100 + index,
    name: `PeerJS Cloud (${config.host})`,
    config,
  })),

  // Приоритет 2: Комьюнити серверы
  ...COMMUNITY_SERVERS.map((config, index) => ({
    method: 'peerjs-community' as SignalingMethod,
    priority: 200 + index,
    name: `Community Server (${config.host})`,
    config,
  })),

  // Приоритет 3: Trystero с торрент-трекерами
  {
    method: 'trystero-torrent' as SignalingMethod,
    priority: 300,
    name: 'Trystero (Torrent Trackers)',
    config: { trackers: TORRENT_TRACKERS },
  },
].sort((a, b) => a.priority - b.priority);

// ============================================================================
// PEERJS CONNECTION HELPERS
// ============================================================================

/**
 * Создать PeerJS подключение с таймаутом
 */
function createPeerJSConnection(
  config: any,
  timeout: number = 15000
): Promise<{ peer: Peer; connection?: any }> {
  return new Promise((resolve, reject) => {
    const peerConfig = {
      debug: 1,
      ...config,
    };

    const peer = new Peer(peerConfig);

    const timeoutId = setTimeout(() => {
      peer.destroy();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);

    peer.on('open', (id) => {
      clearTimeout(timeoutId);
      logger.info(`[PeerJS] Connected to ${config.host}, ID: ${id}`);
      resolve({ peer });
    });

    peer.on('error', (err) => {
      clearTimeout(timeoutId);
      peer.destroy();
      reject(err);
    });
  });
}

/**
 * Подключиться к хосту через PeerJS
 */
function connectToHostViaPeerJS(
  peer: Peer,
  hostId: string,
  timeout: number = 10000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const conn = peer.connect(hostId);

    const timeoutId = setTimeout(() => {
      conn.close();
      reject(new Error(`Connection to host timeout after ${timeout}ms`));
    }, timeout);

    conn.on('open', () => {
      clearTimeout(timeoutId);
      resolve(conn);
    });

    conn.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

// ============================================================================
// TRYSTERO CONNECTION HELPERS
// ============================================================================

/**
 * Создать Trystero room для сигналинга
 */
function createTrysteroRoom(
  roomId: string,
  trackers: string[],
  timeout: number = 20000
): Promise<TrysteroRoom> {
  return new Promise((resolve, reject) => {
    try {
      const config = {
        appId: 'nexus-game-table',
        trackers,
      };

      logger.info(`[Trystero] Creating room: ${roomId} with ${trackers.length} trackers`);

      const room = joinRoom(config, roomId);

      // Trystero не имеет явного 'open' события, даём небольшую задержку
      // для инициализации
      setTimeout(() => {
        resolve(room);
      }, 1000);

      // Таймаут для случая, если трекеры недоступны
      setTimeout(() => {
        reject(new Error(`Trystero connection timeout after ${timeout}ms`));
      }, timeout);
    } catch (error) {
      reject(error);
    }
  });
}

// ============================================================================
// MAIN FALLBACK MANAGER
// ============================================================================

export class FallbackSignalingManager {
  private currentAttempt: number = 0;
  private maxAttempts: number = SIGNALING_CONFIGS.length;
  private callbacks: FallbackCallbacks;

  constructor(callbacks: FallbackCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Попытаться подключиться как гость
   */
  async connectAsGuest(
    hostId: string,
    playerName: string,
    callbacks: FallbackCallbacks = {}
  ): Promise<SignalingResult> {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.currentAttempt = 0;

    logger.info('[Connect] Starting guest connection with fallback');

    // Пробуем каждый метод по порядку
    for (const config of SIGNALING_CONFIGS) {
      this.currentAttempt++;
      this.callbacks.onMethodAttempt?.(config.method);

      logger.info(`[Connect] Attempt ${this.currentAttempt}/${this.maxAttempts}: ${config.name}`);

      try {
        const result = await this.attemptGuestConnection(config, hostId, playerName);
        if (result.success) {
          this.callbacks.onMethodSuccess?.(result);
          return result;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`[Connect] Failed with ${config.name}: ${errorMsg}`);
        this.callbacks.onMethodFailure?.(config.method, error);
        // Продолжаем со следующим методом
      }
    }

    // Все методы провалились
    this.callbacks.onAllFailed?.();
    return {
      method: 'peerjs-cloud',
      success: false,
      error: 'All signaling methods failed',
    };
  }

  /**
   * Попытаться создать хост
   */
  async connectAsHost(
    callbacks: FallbackCallbacks = {}
  ): Promise<SignalingResult> {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.currentAttempt = 0;

    logger.info('[Connect] Starting host connection with fallback');

    // Пробуем каждый метод по порядку
    for (const config of SIGNALING_CONFIGS) {
      this.currentAttempt++;
      this.callbacks.onMethodAttempt?.(config.method);

      logger.info(`[Connect] Attempt ${this.currentAttempt}/${this.maxAttempts}: ${config.name}`);

      try {
        const result = await this.attemptHostConnection(config);
        if (result.success) {
          this.callbacks.onMethodSuccess?.(result);
          return result;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.warn(`[Connect] Failed with ${config.name}: ${errorMsg}`);
        this.callbacks.onMethodFailure?.(config.method, error);
        // Продолжаем со следующим методом
      }
    }

    // Все методы провалились
    this.callbacks.onAllFailed?.();
    return {
      method: 'peerjs-cloud',
      success: false,
      error: 'All signaling methods failed',
    };
  }

  /**
   * Попытка подключения как гость для конкретного метода
   */
  private async attemptGuestConnection(
    config: SignalingConfig & { config?: any },
    hostId: string,
    playerName: string
  ): Promise<SignalingResult> {
    if (config.method === 'trystero-torrent') {
      // Trystero использует другой подход - room-based вместо host-based
      const room = await createTrysteroRoom(
        hostId, // Используем hostId как roomId
        config.config.trackers
      );

      return {
        method: config.method,
        success: true,
        room,
      };
    }

    // PeerJS методы
    const { peer } = await createPeerJSConnection(config.config, 15000);
    const connection = await connectToHostViaPeerJS(peer, hostId, 10000);

    return {
      method: config.method,
      success: true,
      peer,
      connection,
    };
  }

  /**
   * Попытка создания хоста для конкретного метода
   */
  private async attemptHostConnection(
    config: SignalingConfig & { config?: any }
  ): Promise<SignalingResult> {
    if (config.method === 'trystero-torrent') {
      // Trystero room для хоста
      const roomId = `nexus-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const room = await createTrysteroRoom(
        roomId,
        config.config.trackers
      );

      return {
        method: config.method,
        success: true,
        room,
      };
    }

    // PeerJS методы
    const { peer } = await createPeerJSConnection(config.config, 15000);

    return {
      method: config.method,
      success: true,
      peer,
    };
  }

  /**
   * Получить список доступных методов
   */
  getAvailableMethods(): SignalingConfig[] {
    return [...SIGNALING_CONFIGS];
  }

  /**
   * Добавить комьюнити сервер
   */
  static addCommunityServer(server: {
    host: string;
    port: number;
    secure: boolean;
    path?: string;
  }) {
    COMMUNITY_SERVERS.push(server);
    logger.info(`[Connect] Added community server: ${server.host}`);
  }

  /**
   * Получить список комьюнити серверов
   */
  static getCommunityServers(): typeof COMMUNITY_SERVERS {
    return [...COMMUNITY_SERVERS];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default FallbackSignalingManager;
