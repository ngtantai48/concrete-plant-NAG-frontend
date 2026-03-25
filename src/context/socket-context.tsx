'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppSelector } from '@/hooks/use-app-selector';

type SocketEventHandler = (eventName: string, ...args: any[]) => void;

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    /**
     * Subscribe to all socket events. Returns an unsubscribe function.
     * This avoids conflicts with socket.onAny/offAny by using an internal
     * listener registry instead.
     */
    onSocketEvent: (handler: SocketEventHandler) => () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const socketRef = useRef<Socket | null>(null);
    // Use state instead of ref for the socket instance so consumers re-render
    // when the socket becomes available
    const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Internal listener registry — avoids onAny/offAny conflicts
    const listenersRef = useRef<Set<SocketEventHandler>>(new Set());

    const tokenState = useAppSelector((state: any) => state.auth.token);

    // Subscribe API
    const onSocketEvent = useCallback((handler: SocketEventHandler) => {
        listenersRef.current.add(handler);
        return () => {
            listenersRef.current.delete(handler);
        };
    }, []);

    useEffect(() => {
        const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
        const SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH;

        if (!SOCKET_URL || !tokenState) return;

        // Prevent multiple socket connections
        if (socketRef.current) return;

        const connectionUrl = SOCKET_PATH ? `${SOCKET_URL}${SOCKET_PATH}` : SOCKET_URL;

        const socket = io(connectionUrl, {
            transports: ['websocket'],
            autoConnect: true,
            auth: { token: `Bearer ${tokenState}` },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        socketRef.current = socket;
        setSocketInstance(socket);

        socket.on('connect', () => {
            console.log('✅ [WebSocket] Kết nối thành công:', socket.id);
            setIsConnected(true);
        });

        socket.on('disconnect', (reason) => {
            console.warn('⚠️ [WebSocket] Ngắt kết nối:', reason);
            setIsConnected(false);
        });

        socket.on('connect_error', (error) => {
            console.error('❌ [WebSocket] Lỗi kết nối:', error.message);
            setIsConnected(false);
        });

        // Single onAny listener that fans out to all subscribers
        socket.onAny((eventName: string, ...args: any[]) => {
            console.log(`[WebSocket] Sự kiện: ${eventName}`, args);
            listenersRef.current.forEach((handler) => {
                try {
                    handler(eventName, ...args);
                } catch (err) {
                    console.error('[WebSocket] Lỗi handler:', err);
                }
            });
        });

        return () => {
            console.log('🧹 [WebSocket] Dọn dẹp kết nối...');
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
            setSocketInstance(null);
            setIsConnected(false);
        };
    }, [tokenState]);

    return (
        <SocketContext.Provider
            value={{
                socket: socketInstance,
                isConnected,
                onSocketEvent,
            }}
        >
            {children}
        </SocketContext.Provider>
    );
};
