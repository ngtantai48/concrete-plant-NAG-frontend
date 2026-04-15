# Socket Library - Internal Documentation

## Overview

Shared Socket.IO client library cho project. Quản lý tập trung tất cả WebSocket connections qua singleton pattern.

## Architecture

```
SocketManager (Singleton per namespace)
    ├── Manages 1 socket connection per namespace
    ├── Handles reconnection with auth refresh
    ├── Provides typed event listeners
    └── Automatic cleanup on unmount
```

## Usage

### 1. Basic Usage (trong hooks/components)

```typescript
import { SocketManager } from '@/lib/socket';

// Get or create singleton for namespace
const manager = SocketManager.getInstance('notifications');

// Set auth provider (called once)
manager.setAuthProvider(() => token);

// Connect
manager.connect();

// Listen to events
manager.on('notification:new', (payload) => {
  console.log('New notification:', payload);
});

// Emit events
manager.emit('notification:mark_read', { user_id: 'all', noti_id: 123 });
```

### 2. Using Hooks (Recommended)

```typescript
// For notifications
import { useSocket } from '@/context/socket-context';

const { notifications, unreadCount, markAsRead } = useSocket();

// For real-time updates
import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

const { isConnected, lastSignal, lastSignalTime } = useRealtimeUpdates(fetchData);

// For device heartbeat
import { useDeviceHeartbeat } from '@/hooks/useDeviceHeartbeat';

const { isSocketConnected, isLedConnected, stationStatusMap } = useDeviceHeartbeat();
```

### 3. Safe Event Listeners

```typescript
import { useSocketEventListener } from '@/hooks/useSocketEventListener';

// Listen to specific event
useSocketEventListener(
  'notification:new',
  (payload) => {
    console.log('New notification:', payload);
  },
  'notifications' // namespace
);

// Listen to all events
useSocketEventListener(
  'any',
  (eventName, ...args) => {
    console.log(eventName, args);
  },
  'updates'
);
```

### 4. Monitoring

```typescript
import { useSocketStatusMonitor } from '@/hooks/useSocketStatusMonitor';

const { statusMap, allConnected, anyDisconnected } = useSocketStatusMonitor([
  'notifications',
  'updates'
]);
```

## Available Namespaces

| Namespace | Purpose | Used By |
|-----------|---------|---------|
| `/notifications` | Real-time notifications | `useSocket()`, Header, DriverDisplay |
| `/updates` | Data refresh signals + device heartbeat | `useRealtimeUpdates()`, `useDeviceHeartbeat()` |

## Event Contracts

### Notification Events (`/notifications`)

```typescript
// Server → Client
'notification:list': NotificationPayload[]
'notification:new': NotificationPayload
'notification:updated': NotificationPayload
'notification:removed': string | number | { id: string | number }
'notification:cleared': void
'notification:refresh': NotificationPayload | NotificationPayload[] | void

// Client → Server
'notification:get_all': void
'notification:mark_read': { user_id: string, noti_id: string | number }
```

### Update Events (`/updates`)

```typescript
// Server → Client
'update': { update_type: string | null, update_id?: number }
'ping': { update_type: string | null, update_id?: number } | void
'camera-status': unknown

// Catch-all: any other event is normalized to UpdateSignal
```

## Configuration

SocketManager default config:

```typescript
{
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
}
```

Customize per instance:

```typescript
const manager = SocketManager.getInstance('custom', {
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  path: '/custom-path',
});
```

## Best Practices

### ✅ DO

- Use `SocketManager.getInstance()` - never create socket directly
- Set auth provider before connect
- Use hooks (`useSocket`, `useRealtimeUpdates`, etc.) when possible
- Cleanup listeners with returned unsubscribe functions
- Validate payloads with schema functions

### ❌ DON'T

- `import { io } from 'socket.io-client'` - use SocketManager instead
- Create multiple connections to same namespace
- Forget to cleanup listeners
- Emit without checking connection status
- Store large payloads in React state without buffering

## Schema Validation

```typescript
import { validateNotificationPayload, validateUpdateSignal, validateDevicePayload, isStationHeartbeat } from '@/lib/socket/schema';

// Validate before processing
const notification = validateNotificationPayload(rawPayload);
if (!notification) {
  console.error('Invalid notification payload');
  return;
}

// Check if device payload is valid heartbeat
if (!isStationHeartbeat(devicePayload)) {
  return; // Not a station heartbeat, ignore
}
```

## Error Handling

All event handlers are wrapped in try-catch automatically. Errors are logged with context:

```
[SocketManager] Error in handler for "notification:new": TypeError: ...
```

Connection errors are tracked and can be monitored via:

```typescript
manager.onConnectionChange((connected) => {
  if (!connected) {
    console.warn('Socket disconnected');
  }
});
```

## Migration from Old Code

### Old Pattern
```typescript
// ❌ Old way
const socket = io(url, { ... });
socket.on('event', handler);
```

### New Pattern
```typescript
// ✅ New way
const manager = SocketManager.getInstance('namespace');
manager.connect();
manager.on('event', handler);
```

## Testing

Run TypeScript checks:
```bash
npx tsc --noEmit
```

Build project:
```bash
npm run build
```

## Files

```
src/lib/socket/
├── client.ts      - SocketManager singleton class
├── types.ts       - Event contracts & interfaces
├── schema.ts      - Payload validation functions
└── index.ts       - Barrel exports
```

## Support

See `SOCKET_OPTIMIZATION_REPORT.md` for detailed architecture and optimization report.
