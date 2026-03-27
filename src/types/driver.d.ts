export interface Driver {
    user_id: number;
    user_full_name: string;
    user_email: string | null;
    user_phone_number: string;
    user_address: string | null;
    user_status: string;
    username: string;
    role: string;
    user_join_date?: string | null;
    user_leave_date?: string | null;
    user_work_shift?: string | null;
    updated_at?: string;
    updated_by?: number;
    media?: unknown[];
}
