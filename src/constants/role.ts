import { ADMIN, CUSTOMER, USER } from "./route";

export const ROLE_DASHBOARD_MAP: Record<string, string> = {
    admin: ADMIN.DASHBOARD,
    user: USER.DASHBOARD,
    customer: CUSTOMER.DASHBOARD,
};
