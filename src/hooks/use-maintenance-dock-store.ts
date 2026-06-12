import { create } from "zustand";

// Chia sẻ trạng thái "dock bảo trì đang hiện hay không" ra ngoài dock.
// Dock (qua useMaintenancePendingDock) là nguồn duy nhất ghi vào đây — tránh
// subscribe socket lần hai. Trang dashboard đọc để quyết hiện/ẩn nút quick voice.
interface MaintenanceDockState {
  hasPending: boolean;
  setHasPending: (value: boolean) => void;
}

export const useMaintenanceDockStore = create<MaintenanceDockState>((set) => ({
  hasPending: false,
  setHasPending: (value) =>
    set((state) => (state.hasPending === value ? state : { hasPending: value })),
}));
