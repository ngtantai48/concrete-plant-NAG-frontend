/**
 * Socket Client Singleton Manager
 * Quản lý tập trung tất cả kết nối socket, tránh tạo nhiều instances
 * Hỗ trợ lazy connect, auth refresh, và error handling
 */

import { io, Socket } from 'socket.io-client';
import type { NotificationEvents, UpdateEvents } from './types';

// ============================================================
// Configuration
// ============================================================

interface SocketConfig {
  transports?: string[];
  path?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  timeout?: number;
}

const DEFAULT_CONFIG: SocketConfig = {
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
};

// ============================================================
// Socket Manager Class
// ============================================================

export class SocketManager {
  private static instances = new Map<string, SocketManager>();

  private socket: Socket | null = null;
  private config: SocketConfig;
  private connectionUrl: string;
  private isConnectedState = false;
  private connectionListeners = new Set<(connected: boolean) => void>();
  private eventListeners = new Map<string, Set<Function>>();
  private reconnectAttempts = 0;
  private authProvider?: () => string | undefined;

  private constructor(namespace: string, config?: Partial<SocketConfig>) {
    const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!baseUrl) {
      throw new Error('[SocketManager] NEXT_PUBLIC_SOCKET_URL is not defined');
    }

    this.connectionUrl = `${baseUrl.replace(/\/$/, '')}/${namespace}`;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Lấy hoặc tạo SocketManager instance cho namespace
   * Singleton pattern - đảm bảo chỉ 1 connection per namespace
   */
  static getInstance(namespace: string, config?: Partial<SocketConfig>): SocketManager {
    if (!SocketManager.instances.has(namespace)) {
      SocketManager.instances.set(namespace, new SocketManager(namespace, config));
    }
    return SocketManager.instances.get(namespace)!;
  }

  /**
   * Set auth provider - function để lấy token mới khi reconnect
   * Giải quyết vấn đề token hết hạn mà không cần recreate socket
   */
  setAuthProvider(authProvider: () => string | undefined): void {
    this.authProvider = authProvider;
  }

  /**
   * Lấy socket instance hiện tại
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Trạng thái kết nối
   */
  get isConnected(): boolean {
    return this.isConnectedState;
  }

  /**
   * Kết nối tới server (lazy connect)
   */
  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    const auth = this.buildAuth();

    this.socket = io(this.connectionUrl, {
      ...this.config,
      auth,
    });

    this.setupConnectionEvents();
    this.socket.connect();

    return this.socket;
  }

  /**
   * Ngắt kết nối và cleanup
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.isConnectedState = false;
      this.notifyConnectionListeners(false);
    }
  }

  /**
   * Đăng ký listener cho event cụ thể
   * Trả về unsubscribe function
   */
  on<EventName extends keyof (NotificationEvents & UpdateEvents)>(
    eventName: EventName,
    handler: Function
  ): () => void {
    if (!this.socket) {
      console.warn(`[SocketManager] Cannot register listener "${String(eventName)}" - socket not connected`);
      return () => { };
    }

    const key = String(eventName);
    if (!this.eventListeners.has(key)) {
      this.eventListeners.set(key, new Set());
    }
    this.eventListeners.get(key)!.add(handler);

    const eventHandler = (...args: unknown[]) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[SocketManager] Error in handler for "${key}":`, error);
      }
    };

    this.socket.on(key, eventHandler);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(key)?.delete(handler);
      this.socket?.off(key, eventHandler);
    };
  }

  /**
   * Đăng ký listener cho TẤT CẢ events
   * Trả về unsubscribe function
   */
  onAny(handler: (eventName: string, ...args: unknown[]) => void): () => void {
    if (!this.socket) {
      console.warn('[SocketManager] Cannot register onAny listener - socket not connected');
      return () => { };
    }

    this.socket.onAny(handler);

    return () => {
      this.socket?.offAny(handler);
    };
  }

  /**
   * Emit event tới server
   * Hỗ trợ acknowledgment callback
   */
  emit<EventName extends keyof (NotificationEvents & UpdateEvents)>(
    eventName: EventName,
    payload?: (NotificationEvents & UpdateEvents)[EventName],
    ack?: (response: unknown) => void
  ): void {
    if (!this.socket || !this.socket.connected) {
      console.warn(`[SocketManager] Cannot emit "${String(eventName)}" - not connected`);
      return;
    }

    if (ack) {
      this.socket.emit(String(eventName), payload, ack);
    } else {
      this.socket.emit(String(eventName), payload);
    }
  }

  /**
   * Đăng ký callback để nhận thông báo khi trạng thái kết nối thay đổi
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    callback(this.isConnectedState); // Notify current state immediately

    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  /**
   * Force reconnect (chỉ dùng khi cần thiết, ví dụ: token mới)
   */
  reconnect(): void {
    this.disconnect();
    // Delay nhỏ để đảm bảo cleanup hoàn tất
    setTimeout(() => this.connect(), 100);
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private buildAuth(): Record<string, string> | undefined {
    const token = this.authProvider?.();
    if (token) {
      return { token: `Bearer ${token}` };
    }
    return undefined;
  }

  private setupConnectionEvents(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log(`[SocketManager] Connected to ${this.connectionUrl}`);
      this.isConnectedState = true;
      this.reconnectAttempts = 0;
      this.notifyConnectionListeners(true);
    });

    this.socket.on('disconnect', (reason: string) => {
      console.warn(`[SocketManager] Disconnected: ${reason}`);
      this.isConnectedState = false;
      this.notifyConnectionListeners(false);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error(`[SocketManager] Connection error: ${error.message}`);
      this.reconnectAttempts++;

      // Sau 10 lần reconnect thất bại, có thể cần refresh token
      if (this.reconnectAttempts >= 10 && this.authProvider) {
        console.warn('[SocketManager] Too many reconnect attempts, token may be expired');
      }
    });
  }

  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('[SocketManager] Error in connection listener:', error);
      }
    });
  }

  /**
   * Cleanup tất cả instances (chỉ dùng khi unmount toàn bộ app)
   */
  static cleanupAll(): void {
    SocketManager.instances.forEach((manager) => manager.disconnect());
    SocketManager.instances.clear();
  }
}
