import { ADMIN, DISPATCHER, DRIVER, MANAGER, USER } from "./route";

export const ROLE_DASHBOARD_MAP: Record<string, string> = {
    admin: ADMIN.DASHBOARD,
    manager: MANAGER.DASHBOARD,
    dispatcher: DISPATCHER.DASHBOARD,
    driver: DRIVER.DASHBOARD,
    user: USER.DASHBOARD,
};
