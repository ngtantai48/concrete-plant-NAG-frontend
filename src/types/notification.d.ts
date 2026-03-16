export interface Notification {
    id: string | number;
    userId: string | number;
    read: boolean;
    createdAt: string;
    visibleDate?: string;
    reader_list: (string | number)[];
    code: string;
    content: string | Record<string, any>;
    [key: string]: any;
}
