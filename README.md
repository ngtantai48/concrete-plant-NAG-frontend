# concrete-plant-NAG-frontend

## Socket.IO Realtime Updates

Dashboard admin tích hợp Socket.IO để nhận tín hiệu realtime từ backend qua namespace `/updates`.

- **Event**: `update` với payload `{ update_type: string | null, update_id?: number }`
- **update_type**: `vehicles` | `stations` | `orders` | `null` (refetch tất cả)
- **Hook**: `useRealtimeUpdates` - kết nối namespace `/updates`, dispatch callback theo `update_type`
- **ENV**: `NEXT_PUBLIC_SOCKET_URL` - URL socket server (cùng biến với notification socket)
