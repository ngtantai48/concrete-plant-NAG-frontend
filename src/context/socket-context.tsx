'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppSelector } from '@/hooks/use-app-selector';
import { Notification } from '@/types/notification';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
    notifications: Notification[];
    unreadCount: number;
    markAsRead: (id: string | number) => void;
    clearNotifications: () => void;
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

    const [isConnected, setIsConnected] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const tokenState = useAppSelector((state: any) => state.auth.token);

    useEffect(() => {
        const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
        const SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH;

        if (!SOCKET_URL || !tokenState) return;

        if (socketRef.current) return;

        const connectionUrl = SOCKET_PATH ? `${SOCKET_URL}${SOCKET_PATH}` : SOCKET_URL;

        const socket = io(connectionUrl, {
            transports: ['websocket'],
            autoConnect: true,
            auth: { token: `Bearer ${tokenState}` },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setIsConnected(true);
            socket.emit('notification:get_all');
        });

        socket.on('disconnect', (reason) => {
            console.warn('Socket disconnected:', reason);
            setIsConnected(false);
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connect error:', error.message);
        });

        socket.on('notification:list', (data: any[]) => {
            if (!Array.isArray(data)) return;

            const formattedNotifications: Notification[] = data.map((item) => ({
                id: item.id,
                userId: item.userId,
                read: Boolean(item.read),
                createdAt: item.created_at || new Date().toISOString(),
                visibleDate: item.visible_date,
                reader_list: item.reader_list || [],
                code: item.code || 'NOTIFICATION',
                content: item.content || '',
                ...item
            }));

            setNotifications(formattedNotifications);
        });

        const handleNewNotification = (data: any) => {
            if (!data) return;

            const newNotification: Notification = {
                id: data.id,
                userId: data.userId,
                read: Boolean(data.read),
                createdAt: data.created_at || new Date().toISOString(),
                visibleDate: data.visible_date,
                reader_list: data.reader_list || [],
                code: data.code || 'NOTIFICATION',
                content: data.content || '',
                ...data
            };
            setNotifications((prev) => [newNotification, ...prev]);
        };

        socket.on('notification:new', handleNewNotification);

        socket.on('notification:updated', (data: any) => {
            if (!data || !data.id) return;
            setNotifications((prev) =>
                prev.map((item) =>
                    item.id === data.id
                        ? { ...item, ...data, read: data.read !== undefined ? Boolean(data.read) : item.read }
                        : item
                )
            );
        });

        socket.on('notification:removed', (data: any) => {
            const idToRemove = data?.id || data;
            if (!idToRemove) return;
            setNotifications((prev) => prev.filter((item) => item.id !== idToRemove));
        });

        socket.on('notification:cleared', () => {
            setNotifications([]);
        });

        socket.on('notification:refresh', () => {
            socket.emit('notification:get_all');
        });

        socket.on('notification', (data: any) => {
            if (!data) return;
        });

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
        };
    }, [tokenState]);

    const userId = useAppSelector((state: any) => state.auth.user?.id);

    const markAsRead = (id: string | number) => {
        const targetNotif = notifications.find(n => n.id === id);
        if (!targetNotif || targetNotif.read) return;

        setNotifications((prev) =>
            prev.map((notif) =>
                notif.id === id ? { ...notif, read: true } : notif
            )
        );

        if (socketRef.current && isConnected) {
            const payload = {
                user_id: targetNotif.userId || userId,
                noti_id: id
            };
            socketRef.current.emit('notification:mark_read', payload);
        }
    };

    const clearNotifications = () => {
        setNotifications([]);
    };

    const unreadCount = notifications.filter((n) => !n.read).length;

    return (
        <SocketContext.Provider
            value={{
                socket: socketRef.current,
                isConnected,
                notifications,
                unreadCount,
                markAsRead,
                clearNotifications,
            }}
        >
            {children}
        </SocketContext.Provider>
    );
};
