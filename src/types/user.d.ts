export interface BaseUser {
    user_full_name: string;
    user_short_name?: string | null;
    user_email: string;
    user_phone_number: string;
    user_address?: string | null;
    user_join_date?: string | null;
    user_work_shift?: string | null;
}

export interface User extends BaseUser {
    user_id: number;
    username: string;
    role: string;
    role_label: string;
    user_status?: string | null;
    delete_flag?: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface CreateUserPayload extends BaseUser {
    username: string;
    password: string;
    role: UserRole;
}

export interface UpdateUserPayload extends BaseUser {
    username: string;
    password?: string;
    role: UserRole;
}

export interface AuthUser extends User {
    token: string;
}
