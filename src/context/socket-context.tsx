"use client";

import { useAppSelector } from "@/hooks/use-app-selector";
import { useProactiveTokenRefresh } from "@/hooks/useProactiveTokenRefresh";
import { getNotificationText, getNotificationTimestampValue, shouldSpeakNotification } from "@/lib/notification";
import { SocketManager } from "@/lib/socket";
import { validateNotificationPayload } from "@/lib/socket/schema";
import type { NotificationPayload } from "@/lib/socket/types";
import { Notification } from "@/types/notification";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type SocketEventHandler = (eventName: string, ...args: unknown[]) => void;

const VI_NOTIFICATION_LOCALE = "vi";
const VI_NOTIFICATION_LANG = "vi-VN";

function getNotificationOwnerId(notification: Notification): string | number {
  const ownerId = notification.userId ?? notification.user_id ?? "all";
  return typeof ownerId === "string" || typeof ownerId === "number" ? ownerId : "all";
}
const FEMALE_VOICE_KEYWORDS = ["hoaimy", "female", "woman", "girl", "nu"];

function getVoiceIdentity(voice: SpeechSynthesisVoice): string {
  return `${voice.name} ${voice.voiceURI}`.toLowerCase();
}

function isVietnameseVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().startsWith("vi");
}

function isFemaleVoice(voice: SpeechSynthesisVoice): boolean {
  const voiceIdentity = getVoiceIdentity(voice);
  return FEMALE_VOICE_KEYWORDS.some((keyword) => voiceIdentity.includes(keyword));
}

function pickVietnameseFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return voices.find((voice) => isVietnameseVoice(voice) && isFemaleVoice(voice) && voice.localService)
    ?? voices.find((voice) => isVietnameseVoice(voice) && isFemaleVoice(voice))
    ?? voices.find((voice) => voice.lang.toLowerCase() === VI_NOTIFICATION_LANG.toLowerCase() && voice.localService)
    ?? voices.find((voice) => voice.lang.toLowerCase() === VI_NOTIFICATION_LANG.toLowerCase())
    ?? voices.find((voice) => isVietnameseVoice(voice) && voice.localService)
    ?? voices.find((voice) => isVietnameseVoice(voice))
    ?? null;
}

interface SocketStatusInfo {
  isConnected: boolean;
  lastError?: string;
  reconnectAttempts: number;
}

interface SocketContextType {
  isConnected: boolean; // Main connection (notifications)
  statusMap: Record<string, SocketStatusInfo>;
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string | number) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  refreshNotifications: () => void;
  /** Whether voice notifications are muted */
  isMuted: boolean;
  /** Toggle voice notification mute on/off */
  toggleMute: () => void;
  /**
   * Subscribe to all socket events. Returns an unsubscribe function.
   */
  onSocketEvent: (handler: SocketEventHandler) => () => void;
  /**
   * Background tick from the centralized Web Worker (every 15s)
   */
  lastBackgroundTick: number;
  /**
   * Global app visibility state
   */
  appVisibility: Document["visibilityState"];
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

// Throttle helper
function createThrottle(ms: number) {
  let lastCall = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (callback: () => void) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= ms) {
      lastCall = now;
      callback();
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        lastCall = Date.now();
        callback();
        timeout = null;
      }, ms - elapsed);
    }
  };
}

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Tự động refresh access token trước khi hết hạn
  // Đảm bảo server luôn gửi "update" events qua socket
  useProactiveTokenRefresh();

  const managerRef = useRef<SocketManager | null>(null);
  const prevTokenRef = useRef<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, SocketStatusInfo>>({
    notifications: { isConnected: false, reconnectAttempts: 0 },
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const notificationsRef = useRef<Notification[]>([]);
  const spokenNotificationIdsRef = useRef<Set<string | number>>(new Set());
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);

  // Centralized background polling & visibility
  const [lastBackgroundTick, setLastBackgroundTick] = useState<number>(Date.now());
  const [appVisibility, setAppVisibility] = useState<Document["visibilityState"]>('visible');

  const listenersRef = useRef<Set<SocketEventHandler>>(new Set());

  const tokenState = useAppSelector((state: any) => state.auth.token);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  // ============================================================
  // Centralized Web Worker (Single instance for the entire app)
  // ============================================================
  useEffect(() => {
    if (typeof Worker === 'undefined') return;

    const workerCode = `
      let intervalId = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          intervalId = setInterval(() => { self.postMessage('tick'); }, 15000);
        } else if (e.data === 'stop') {
          clearInterval(intervalId);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = () => {
      setLastBackgroundTick(Date.now());
    };

    worker.postMessage('start');

    return () => {
      worker.postMessage('stop');
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  // ============================================================
  // Centralized Visibility Handler
  // ============================================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      setAppVisibility(document.visibilityState);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const speakNotification = useCallback((notification: NotificationPayload | Notification) => {
    // Skip speech if user has muted voice notifications
    if (isMutedRef.current) return;
    if (!shouldSpeakNotification(notification)) return;

    const notificationId = notification.id;
    if (notificationId === undefined || notificationId === null) return;
    if (spokenNotificationIdsRef.current.has(notificationId)) return;

    spokenNotificationIdsRef.current.add(notificationId);

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(
      getNotificationText(notification, VI_NOTIFICATION_LOCALE)
    );
    const availableVoices = window.speechSynthesis.getVoices();
    const preferredVoice = pickVietnameseFemaleVoice(availableVoices);

    utterance.lang = VI_NOTIFICATION_LANG;
    utterance.rate = 0.7;
    utterance.pitch = 1;
    utterance.volume = 1;

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  // Initialize socket managers (singleton)
  useEffect(() => {
    if (!tokenState) {
      SocketManager.cleanupAll();
      managerRef.current = null;
      prevTokenRef.current = undefined;
      setIsConnected(false);
      setNotifications([]);
      setStatusMap({
        notifications: { isConnected: false, reconnectAttempts: 0 },
      });
      return;
    }

    if (!process.env.NEXT_PUBLIC_SOCKET_URL) {
      return;
    }

    // 1. Notifications namespace
    const managerNoti = SocketManager.getInstance('notifications', {
      path: '/gateways',
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    managerNoti.setAuthProvider(() => tokenState);
    managerRef.current = managerNoti;

    const unsubscribeNoti = managerNoti.onConnectionChange((connected) => {
      setIsConnected(connected);
      setStatusMap(prev => ({
        ...prev,
        notifications: { ...prev.notifications, isConnected: connected }
      }));
    });

    // 2. Updates namespace (Centralized tracking for Dashboard/IoT)
    const managerUpdates = SocketManager.getInstance('updates', {
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    });
    managerUpdates.setAuthProvider(() => tokenState);

    // Đảm bảo statusMap có entry cho updates
    setStatusMap(prev => ({
      ...prev,
      updates: { isConnected: managerUpdates.isConnected, reconnectAttempts: 0 }
    }));

    const unsubscribeUpdates = managerUpdates.onConnectionChange((connected) => {
      setStatusMap(prev => ({
        ...prev,
        updates: { ...prev.updates, isConnected: connected }
      }));
    });

    // Lần đầu hoặc token đổi (refresh) -> reconnect/connect
    const prevToken = prevTokenRef.current;
    prevTokenRef.current = tokenState;
    const notificationSocketAlreadyConnected = Boolean(managerNoti.getSocket()?.connected);

    if ((prevToken && prevToken !== tokenState) || (!prevToken && notificationSocketAlreadyConnected)) {
      managerNoti.reconnect();
      if (managerUpdates.getSocket()) {
        managerUpdates.reconnect();
      }
    } else {
      managerNoti.connect();
    }

    return () => {
      unsubscribeNoti();
      unsubscribeUpdates();
    };
  }, [tokenState]);

  // Setup event listeners
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isConnected) return;

    const unsubscribes: Array<() => void> = [];

    // notification:list
    unsubscribes.push(
      manager.on('notification:list', (payload: unknown) => {
        if (!Array.isArray(payload)) return;

        const incoming = payload
          .map(validateNotificationPayload)
          .filter((n): n is NotificationPayload => n !== null)
          .sort((a, b) => getNotificationTimestampValue(b) - getNotificationTimestampValue(a));

        setNotifications(incoming as Notification[]);
      })
    );

    // notification:new
    unsubscribes.push(
      manager.on('notification:new', (payload: unknown) => {
        const validated = validateNotificationPayload(payload);
        if (!validated) return;

        const exists = notificationsRef.current.some((item) => item.id === validated.id);
        if (!exists) {
          speakNotification(validated);
        }
        setNotifications((prev) => {
          const exists = prev.find((n) => n.id === validated.id);
          if (exists) return prev; // Avoid duplicates
          return [...prev, validated as Notification].sort(
            (a, b) => getNotificationTimestampValue(b) - getNotificationTimestampValue(a)
          );
        });
      })
    );

    // notification:updated
    unsubscribes.push(
      manager.on('notification:updated', (payload: unknown) => {
        const validated = validateNotificationPayload(payload);
        if (!validated) return;

        setNotifications((prev) =>
          prev.map((item) => {
            if (item.id !== validated.id) return item;
            return {
              ...item,
              ...validated,
              id: validated.id,
              event: validated.event,
              read: validated.read,
              createdAt: validated.createdAt,
            } as Notification;
          })
        );
      })
    );

    // notification:removed
    unsubscribes.push(
      manager.on('notification:removed', (payload: unknown) => {
        const idToRemove =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>).id
            : payload;

        if (typeof idToRemove !== 'string' && typeof idToRemove !== 'number') return;

        setNotifications((prev) => prev.filter((item) => item.id !== idToRemove));
      })
    );

    // notification:cleared
    unsubscribes.push(
      manager.on('notification:cleared', () => {
        setNotifications([]);
      })
    );

    // notification:refresh - with throttle to prevent storm
    const throttledRefresh = createThrottle(1000); // Max 1 refresh per second
    unsubscribes.push(
      manager.on('notification:refresh', (payload: unknown) => {
        throttledRefresh(() => {
          if (Array.isArray(payload)) {
            const incoming = payload
              .map(validateNotificationPayload)
              .filter((n): n is NotificationPayload => n !== null);

            setNotifications((prev) => {
              const map = new Map<string | number, Notification>();
              prev.forEach((item) => map.set(item.id, item));
              incoming.forEach((item) => {
                const existing = map.get(item.id);
                const notification: Notification = {
                  ...item,
                  id: item.id,
                  event: item.event,
                  read: item.read,
                  createdAt: item.createdAt,
                } as Notification;
                map.set(item.id, existing ? { ...existing, ...notification } : notification);
              });
              return Array.from(map.values()).sort(
                (a, b) => getNotificationTimestampValue(b) - getNotificationTimestampValue(a)
              );
            });
            return;
          }

          if (typeof payload === 'object' && payload !== null) {
            const validated = validateNotificationPayload(payload);
            if (!validated) return;

            const exists = notificationsRef.current.some((item) => item.id === validated.id);
            if (!exists) {
              speakNotification(validated);
            }

            setNotifications((prev) => {
              const exists = prev.find((n) => n.id === validated.id);
              if (exists) {
                return prev.map((item) => {
                  if (item.id !== validated.id) return item;
                  return {
                    ...item,
                    ...validated,
                    id: validated.id,
                    event: validated.event,
                    read: validated.read,
                    createdAt: validated.createdAt,
                  } as Notification;
                });
              }
              return [...prev, validated as Notification].sort(
                (a, b) => getNotificationTimestampValue(b) - getNotificationTimestampValue(a)
              );
            });
            return;
          }

          // Fallback: request all
          manager.emit('notification:get_all');
        });
      })
    );

    // Request all notifications after listeners are ready.
    manager.emit('notification:get_all');

    // Broadcast events to custom listeners (for DriverDisplay, etc.)
    unsubscribes.push(
      manager.onAny((eventName: string, ...args: unknown[]) => {
        listenersRef.current.forEach((handler) => {
          try {
            handler(eventName, ...args);
          } catch (err) {
            console.error('[SocketProvider] Custom handler error:', err);
          }
        });
      })
    );

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [isConnected, speakNotification]);

  // Mark as read
  const markAsRead = useCallback(
    (id: string | number) => {
      const target = notificationsRef.current.find((item) => item.id === id);
      if (!target || target.read) return;

      setNotifications((prev) =>
        prev.map((item) => {
          if (item.id !== id || item.read) return item;
          return { ...item, read: true };
        })
      );

      const manager = managerRef.current;
      if (!manager || !isConnected) return;

      manager.emit('notification:mark_read', {
        user_id: getNotificationOwnerId(target),
        noti_id: id,
      });
    },
    [isConnected]
  );

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    const unreadItems = notificationsRef.current.filter((item) => !item.read);
    if (unreadItems.length === 0) return;

    setNotifications((prev) =>
      prev.map((item) => (item.read ? item : { ...item, read: true }))
    );

    const manager = managerRef.current;
    if (!manager || !isConnected) return;

    unreadItems.forEach((item) => {
      manager.emit('notification:mark_read', {
        user_id: getNotificationOwnerId(item),
        noti_id: item.id,
      });
    });
  }, [isConnected]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const refreshNotifications = useCallback(() => {
    const manager = managerRef.current;
    if (!manager || !isConnected) return;
    manager.emit('notification:get_all');
  }, [isConnected]);

  const onSocketEvent = useCallback((handler: SocketEventHandler) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        isConnected,
        statusMap,
        notifications,
        unreadCount: notifications.filter((item) => !item.read).length,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        refreshNotifications,
        isMuted,
        toggleMute: () => {
          setIsMuted(prev => {
            const next = !prev;
            isMutedRef.current = next;
            // Stop any currently speaking utterance when muting
            if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
              window.speechSynthesis.cancel();
            }
            return next;
          });
        },
        onSocketEvent,
        lastBackgroundTick,
        appVisibility,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
