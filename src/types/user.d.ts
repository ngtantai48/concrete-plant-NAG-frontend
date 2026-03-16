export interface BaseUser {
    user_full_name: string;
    user_email: string;
    user_phone_number?: string | null;
}

export interface UserProperty {
    name: string;
    value: string;
}

export interface User extends BaseUser {
    user_id: number;
    username: string;
    role: string;
    delete_flag: boolean;
    created_at: string;
    updated_at: string;
    properties?: UserProperty[];
}

export interface CreateUserPayload extends BaseUser {
    username: string;
    password: string;
    confirmPassword?: string;
    role_id: number;
    properties?: UserProperty[];
}

export interface UpdateUserPayload extends BaseUser {
    password?: string;
    confirmPassword?: string;
    role_id: number;
    properties?: UserProperty[];
}

export interface AuthUser extends User {
    token: string;
}
