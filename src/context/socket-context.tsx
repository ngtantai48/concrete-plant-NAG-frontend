"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SocketManager } from "@/lib/socket";
import { validateNotificationPayload } from "@/lib/socket/schema";
import type { NotificationPayload } from "@/lib/socket/types";
import { useAppSelector } from "@/hooks/use-app-selector";
import { Notification } from "@/types/notification";

type SocketEventHandler = (eventName: string, ...args: unknown[]) => void;

interface SocketContextType {
  isConnected: boolean;
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string | number) => void;
  clearNotifications: () => void;
  refreshNotifications: () => void;
  /**
   * Subscribe to all socket events. Returns an unsubscribe function.
   */
  onSocketEvent: (handler: SocketEventHandler) => () => void;
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
  const managerRef = useRef<SocketManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const listenersRef = useRef<Set<SocketEventHandler>>(new Set());
  
  const tokenState = useAppSelector((state: any) => state.auth.token);
  const currentUserId = useAppSelector((state: any) => state.auth.user?.id);

  // Initialize socket manager (singleton)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SOCKET_URL || !tokenState) return;

    const manager = SocketManager.getInstance('notifications', {
      path: '/gateways',
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    // Set auth provider cho token refresh
    manager.setAuthProvider(() => tokenState);
    
    managerRef.current = manager;

    // Connection state listener
    const unsubscribeConnection = manager.onConnectionChange(setIsConnected);

    // Connect
    manager.connect();

    return () => {
      unsubscribeConnection();
      // Không disconnect ở đây để giữ connection cho toàn app
      // Chỉ disconnect khi app unmount hoàn toàn
    };
  }, [tokenState]);

  // Setup event listeners
  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !isConnected) return;

    const unsubscribes: Array<() => void> = [];

    // Request all notifications on connect
    manager.emit('notification:get_all');

    // notification:list
    unsubscribes.push(
      manager.on('notification:list', (payload: unknown) => {
        if (!Array.isArray(payload)) return;

        const incoming = payload
          .map(validateNotificationPayload)
          .filter((n): n is NotificationPayload => n !== null)
          .sort(
            (a, b) => {
              const dateA = new Date(a.visibleDate ?? a.createdAt ?? Date.now()).getTime();
              const dateB = new Date(b.visibleDate ?? b.createdAt ?? Date.now()).getTime();
              return dateB - dateA;
            }
          );

        setNotifications(incoming as Notification[]);
      })
    );

    // notification:new
    unsubscribes.push(
      manager.on('notification:new', (payload: unknown) => {
        const validated = validateNotificationPayload(payload);
        if (!validated) return;
        
        setNotifications((prev) => {
          const exists = prev.find((n) => n.id === validated.id);
          if (exists) return prev; // Avoid duplicates
          return [...prev, validated as Notification].sort(
            (a, b) =>
              new Date(b.visibleDate || b.createdAt).getTime() -
              new Date(a.visibleDate || a.createdAt).getTime()
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
                (a, b) =>
                  new Date(b.visibleDate ?? b.createdAt).getTime() -
                  new Date(a.visibleDate ?? a.createdAt).getTime()
              );
            });
            return;
          }

          if (typeof payload === 'object' && payload !== null) {
            const validated = validateNotificationPayload(payload);
            if (!validated) return;

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
              return [...prev, validated as Notification];
            });
            return;
          }

          // Fallback: request all
          manager.emit('notification:get_all');
        });
      })
    );

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
  }, [isConnected]);

  // Mark as read
  const markAsRead = useCallback(
    (id: string | number) => {
      setNotifications((prev) =>
        prev.map((item) => {
          if (item.id !== id || item.read) return item;
          return { ...item, read: true };
        })
      );

      const manager = managerRef.current;
      if (!manager || !isConnected) return;

      manager.emit('notification:mark_read', {
        user_id: 'all',
        noti_id: id,
      });
    },
    [isConnected]
  );

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
        notifications,
        unreadCount: notifications.filter((item) => !item.read).length,
        markAsRead,
        clearNotifications,
        refreshNotifications,
        onSocketEvent,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
