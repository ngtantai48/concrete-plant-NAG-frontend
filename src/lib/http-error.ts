import { logoutSuccess } from "@/store/slices/authSlice";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { getStore } from "./http";

interface ErrorResponse {
    message?: string;
}

export function isIgnorableHttpError(error: unknown) {
    const axiosError = error as AxiosError;
    const status = axiosError?.response?.status;
    const code = (axiosError as any)?.code;
    const message = axiosError?.message;

    if (code === "ERR_CANCELED") return true;
    if (status === 304) return true;
    if (!axiosError?.response && (code === "ERR_NETWORK" || message === "Network Error")) return true;

    return false;
}

export function logHttpError(context: string, error: unknown) {
    if (isIgnorableHttpError(error)) return;
    console.error(context, error);
}



export function handleHttpError(error: AxiosError<ErrorResponse>) {

    const store = getStore();
    const status = error.response?.status;
    const url = error.config?.url;
    const data = error.response?.data;

    // 1. Lỗi kết nối (Network Error)
    if (!error.response) {
        toast.error("Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền.");
        return Promise.reject(error);
    }

    // 2. Xử lý theo mã trạng thái (Status Code)
    switch (status) {
        case 400:
            toast.error(data?.message || "Dữ liệu không hợp lệ.");
            break;

        case 401:
            // Nếu lỗi 401 tại API refresh thì mới logout
            if (url?.includes("/refresh") || url?.includes("/auth/refresh")) {
                console.warn("⚠️ Phiên đăng nhập hết hạn, đang đăng xuất...");
                store?.dispatch(logoutSuccess());
                // toast.error("Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
                return Promise.reject(error);
            }
            // Các lỗi 401 khác sẽ được interceptor xử lý (thử refresh token)
            break;

        case 403:
            toast.error("Bạn không có quyền thực hiện hành động này.");
            break;

        case 404:
            toast.warning("Dữ liệu không tồn tại.");
            break;

        case 500:
            toast.error("Lỗi hệ thống. Vui lòng thử lại sau.");
            break;

        default:
            toast.error(data?.message || "Đã có lỗi xảy ra.");
            break;
    }

    return Promise.reject(error);
}
