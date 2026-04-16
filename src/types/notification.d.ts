export interface Notification {
    id: string | number;
    userId?: string | number;
    read: boolean;
    createdAt: string;
    emittedAt?: string;
    visibleDate?: string;
    reader_list?: (string | number)[];
    code?: string;
    content?: string | Record<string, unknown>;
    event?: string;
    type?: string;
    title?: string;
    message?: string;
    order_id?: number;
    order_number?: number;
    vehicle_id?: number;
    vehicle_name?: string;
    vehicle_license_plate?: string;
    station_id?: number;
    station_name?: string;
    user_id?: number;
    user_name?: string;
    [key: string]: unknown;
}
