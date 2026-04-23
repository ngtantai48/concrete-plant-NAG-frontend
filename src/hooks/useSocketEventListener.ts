import { useEffect, useRef } from 'react';
import { SocketManager } from '@/lib/socket';

export function useSocketEventListener<EventName extends string>(
  eventName: EventName | 'any',
  handler: EventName extends 'any'
    ? (eventName: string, ...args: unknown[]) => void
    : (payload: unknown) => void,
  namespace: string = 'notifications',
  enabled: boolean = true
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    let manager: SocketManager;

    try {
      manager = SocketManager.getInstance(namespace);
    } catch (error) {
      console.error(`[useSocketEventListener] Failed to get manager for ${namespace}:`, error);
      return;
    }

    if (eventName === 'any') {
      const wrappedHandler = (event: string, ...args: unknown[]) => {
        try {
          (handlerRef.current as Function)(event, ...args);
        } catch (error) {
          console.error(`[useSocketEventListener] Error in "${event}" handler:`, error);
        }
      };

      return manager.onAny(wrappedHandler);
    }

    const wrappedHandler = (payload: unknown) => {
      try {
        (handlerRef.current as Function)(payload);
      } catch (error) {
        console.error(`[useSocketEventListener] Error in "${eventName}" handler:`, error);
      }
    };

    return manager.on(eventName as any, wrappedHandler);
  }, [namespace, eventName, enabled]);
}

export function useSocketEmit(namespace: string = 'notifications') {
  const managerRef = useRef<SocketManager | null>(null);

  useEffect(() => {
    try {
      managerRef.current = SocketManager.getInstance(namespace);
    } catch (error) {
      console.error(`[useSocketEmit] Failed to get manager for ${namespace}:`, error);
    }
  }, [namespace]);

  const emit = <EventName extends string>(
    eventName: EventName,
    payload?: unknown,
    ack?: (response: unknown) => void
  ) => {
    if (!managerRef.current) {
      console.warn(`[useSocketEmit] Manager not initialized for ${namespace}`);
      return;
    }

    if (!managerRef.current.isConnected) {
      console.warn(`[useSocketEmit] Not connected, cannot emit "${eventName}"`);
      return;
    }

    managerRef.current.emit(eventName as any, payload, ack);
  };

  return emit;
}
