"use client";

import { useMaintenanceDockStore } from "@/hooks/use-maintenance-dock-store";
import QuickAskMicButton from "./QuickAskMicButton";

// Nút hỏi nhanh bằng giọng nói luôn hiện ở góc dưới phải, vị trí động theo dock
// bảo trì: đang có phiếu chờ (dock hiện ở bottom-6 right-6) → đẩy nút voice LÊN
// trên dock (bottom-24) cho khỏi chồng; hết phiếu → TỤT về sát góc (bottom-6).
export default function DashboardQuickVoice() {
  const hasPending = useMaintenanceDockStore((s) => s.hasPending);
  return <QuickAskMicButton className={hasPending ? "bottom-24 right-6" : "bottom-6 right-6"} />;
}
