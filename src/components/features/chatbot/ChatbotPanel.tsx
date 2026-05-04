"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, RotateCcw, ChevronRight } from "lucide-react";
import reportApi from "@/services/report.service";
import orderApi from "@/services/order.service";
import vehicleApi from "@/services/vehicle.service";
import dayjs from "dayjs";

interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  time: string;
  loading?: boolean;
}

const SUGGESTED = [
  "Hôm nay có bao nhiêu chuyến?",
  "Xe nào cần bảo trì gấp?",
  "Sản lượng tháng này?",
  "Xe nào chạy nhiều nhất?",
  "Tỷ lệ hoàn thành hôm nay?",
];

async function queryEngine(input: string): Promise<string> {
  const q = input.toLowerCase().trim();
  const today = dayjs().format("YYYY-MM-DD");

  // ─── Hôm nay / chuyến hôm nay
  if (q.includes("hôm nay") || q.includes("today") || q.includes("ngày hôm nay")) {
    if (q.includes("chuyến") || q.includes("lệnh") || q.includes("đơn")) {
      try {
        const res = await orderApi.getAll({ order_start_datetime: today });
        const raw = res.data as any;
        const orders: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
        const completed = orders.filter((o) => o.order_status === "completed").length;
        const running = orders.filter((o) => ["running","collecting","transporting"].includes(o.order_status)).length;
        return `📊 **Hôm nay (${dayjs().format("DD/MM/YYYY")})**\n• Tổng lệnh: **${orders.length}**\n• Hoàn thành: **${completed}**\n• Đang thực hiện: **${running}**\n• Tỷ lệ HT: **${orders.length > 0 ? Math.round(completed/orders.length*100) : 0}%**`;
      } catch {
        return "Không thể tải dữ liệu lệnh hôm nay. Vui lòng thử lại.";
      }
    }
    if (q.includes("tỷ lệ") || q.includes("hoàn thành")) {
      try {
        const res = await orderApi.getAll({ order_start_datetime: today });
        const raw = res.data as any;
        const orders: any[] = Array.isArray(raw) ? raw : (raw?.data ?? raw?.items ?? []);
        const completed = orders.filter((o) => o.order_status === "completed").length;
        const pct = orders.length > 0 ? Math.round(completed/orders.length*100) : 0;
        return `✅ Tỷ lệ hoàn thành hôm nay: **${pct}%** (${completed}/${orders.length} lệnh)${pct >= 90 ? " 🎉 Xuất sắc!" : pct >= 70 ? " 👍 Tốt" : " ⚠️ Cần cải thiện"}`;
      } catch {
        return "Không thể tính tỷ lệ hoàn thành. Vui lòng thử lại.";
      }
    }
  }

  // ─── Bảo trì
  if (q.includes("bảo trì") || q.includes("bao tri") || q.includes("maintenance")) {
    try {
      const res = await reportApi.getMaintenanceForecast();
      const raw = res.data as any;
      const items: any[] = raw?.vehicles ?? raw?.items ?? [];
      const critical = items.filter((i) => i.risk_level === "critical");
      const warning = items.filter((i) => i.risk_level === "warning");
      if (critical.length === 0 && warning.length === 0) {
        return "✅ Tất cả xe đang trong trạng thái an toàn, chưa có xe nào cần bảo trì gấp.";
      }
      let resp = `🔧 **Cảnh báo bảo trì:**\n`;
      if (critical.length > 0) {
        resp += `\n🔴 **Khẩn cấp (${critical.length} xe):**\n`;
        critical.slice(0, 5).forEach((i) => { resp += `• ${i.vehicle_name} (${i.vehicle_license_plate}) — ${Math.round(i.current_km ?? 0).toLocaleString("vi-VN")} km\n`; });
      }
      if (warning.length > 0) {
        resp += `\n🟡 **Cảnh báo (${warning.length} xe):**\n`;
        warning.slice(0, 3).forEach((i) => { resp += `• ${i.vehicle_name} (${i.vehicle_license_plate})\n`; });
      }
      return resp.trim();
    } catch {
      return "Không thể tải dữ liệu bảo trì. Vui lòng thử lại.";
    }
  }

  // ─── Sản lượng tháng
  if (q.includes("tháng") || q.includes("tháng này") || q.includes("month")) {
    try {
      const from = dayjs().startOf("month").format("YYYY-MM-DD");
      const res = await reportApi.getProduction({ from, to: today, group_by: "day" });
      const data = res.data as any;
      const s = data?.summary;
      if (!s) return "Không có dữ liệu sản lượng tháng này.";
      return `📈 **Sản lượng tháng ${dayjs().format("MM/YYYY")}:**\n• Tổng lệnh: **${s.total_orders}**\n• Hoàn thành: **${s.completed}** (${s.total_orders > 0 ? Math.round(s.completed/s.total_orders*100) : 0}%)\n• Tổng KM: **${Math.round(s.total_distance_km).toLocaleString("vi-VN")} km**\n• Trung bình/ngày: **${data.series?.length ? Math.round(s.total_orders/data.series.length) : 0} lệnh**`;
    } catch {
      return "Không thể tải dữ liệu sản lượng tháng. Vui lòng thử lại.";
    }
  }

  // ─── Xe nào chạy nhiều nhất / top xe
  if (q.includes("chạy nhiều") || q.includes("top xe") || q.includes("xe nào") || q.includes("năng suất")) {
    try {
      const from = dayjs().startOf("month").format("YYYY-MM-DD");
      const res = await reportApi.getProduction({ from, to: today, group_by: "day" });
      const top = (res.data as any)?.top_vehicles ?? [];
      if (top.length === 0) return "Không có dữ liệu xe tháng này.";
      let resp = `🏆 **Top xe tháng ${dayjs().format("MM/YYYY")}:**\n`;
      top.slice(0, 5).forEach((v: any, i: number) => {
        const medal = ["🥇","🥈","🥉","4️⃣","5️⃣"][i] ?? `${i+1}.`;
        resp += `${medal} **${v.vehicle_name}** (${v.vehicle_license_plate}) — ${v.total_orders} chuyến, ${Math.round(v.total_distance_km).toLocaleString("vi-VN")} km\n`;
      });
      return resp.trim();
    } catch {
      return "Không thể tải dữ liệu xếp hạng xe. Vui lòng thử lại.";
    }
  }

  // ─── Trạng thái xe
  if (q.includes("trạng thái xe") || q.includes("xe đang") || q.includes("xe hoạt động")) {
    try {
      const res = await vehicleApi.getAll({ limit: 100 });
      const raw = res.data as any;
      const vehicles: any[] = raw?.data ?? raw ?? [];
      const available = vehicles.filter((v) => v.vehicle_status === "available").length;
      const maintenance = vehicles.filter((v) => v.vehicle_status === "maintenance").length;
      const incident = vehicles.filter((v) => v.vehicle_status === "incident").length;
      return `🚛 **Trạng thái đội xe (${vehicles.length} xe):**\n• Sẵn sàng: **${available}**\n• Bảo trì: **${maintenance}**\n• Sự cố: **${incident}**\n• Khác: **${vehicles.length - available - maintenance - incident}**`;
    } catch {
      return "Không thể tải trạng thái xe. Vui lòng thử lại.";
    }
  }

  // ─── Default
  return `🤖 Tôi có thể trả lời các câu hỏi về:\n• Sản lượng hôm nay / tháng này\n• Tỷ lệ hoàn thành\n• Cảnh báo bảo trì xe\n• Xếp hạng xe năng suất\n• Trạng thái đội xe\n\nVui lòng đặt câu hỏi cụ thể hơn!`;
}

function formatText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={i} className="block leading-relaxed">
        {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
      </span>
    );
  });
}

export default function ChatbotPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "bot", text: "Xin chào! Tôi là trợ lý AI của hệ thống.\nTôi có thể giúp bạn tra cứu sản lượng, bảo trì, và trạng thái vận hành. Hỏi tôi bất cứ điều gì! 👋", time: dayjs().format("HH:mm") },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: trimmed, time: dayjs().format("HH:mm") };
    const loadingMsg: Message = { id: `l-${Date.now()}`, role: "bot", text: "", time: "", loading: true };
    setMessages((m) => [...m, userMsg, loadingMsg]);
    setInput("");
    setLoading(true);
    try {
      const reply = await queryEngine(trimmed);
      setMessages((m) => m.map((msg) => msg.loading ? { ...msg, text: reply, time: dayjs().format("HH:mm"), loading: false } : msg));
    } catch {
      setMessages((m) => m.map((msg) => msg.loading ? { ...msg, text: "Đã xảy ra lỗi. Vui lòng thử lại.", time: dayjs().format("HH:mm"), loading: false } : msg));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const reset = () => setMessages([{ id: "0", role: "bot", text: "Xin chào! Tôi là trợ lý AI của hệ thống.\nHỏi tôi về sản lượng, bảo trì, hoặc trạng thái vận hành! 👋", time: dayjs().format("HH:mm") }]);

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3">
      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{ width: 360, height: 520, borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", overflow: "hidden", display: "flex", flexDirection: "column", background: "#fff" }}
          >
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", padding: "14px 16px", flexShrink: 0 }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Bot size={18} className="text-white" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm leading-tight">Trợ lý AI</div>
                    <div className="text-blue-200 text-[11px]">Hệ thống Nguyên Anh II</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={reset} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white" title="Cuộc trò chuyện mới">
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white">
                    <Minimize2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" style={{ background: "#f8fafc" }}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${msg.role === "bot" ? "bg-blue-100" : "bg-indigo-500"}`}>
                    {msg.role === "bot" ? <Bot size={14} className="text-blue-600" /> : <User size={13} className="text-white" />}
                  </div>
                  <div style={{ maxWidth: "78%" }}>
                    {msg.loading ? (
                      <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm border border-gray-100">
                        <Loader2 size={14} className="animate-spin text-blue-400" />
                      </div>
                    ) : (
                      <div className={`rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm ${msg.role === "bot" ? "bg-white border border-gray-100 rounded-tl-sm text-gray-800" : "bg-indigo-500 rounded-tr-sm text-white"}`}>
                        <div className="space-y-0.5">{formatText(msg.text)}</div>
                        {msg.time && <div className={`text-[10px] mt-1 ${msg.role === "bot" ? "text-gray-400" : "text-indigo-200"}`}>{msg.time}</div>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            <div className="px-3 py-2 border-t border-gray-100 bg-white overflow-x-auto flex gap-1.5" style={{ scrollbarWidth: "none", flexShrink: 0 }}>
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => send(s)} className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap font-medium">
                  {s}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-3 pb-3 pt-2 bg-white border-t border-gray-100 flex items-center gap-2" style={{ flexShrink: 0 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Hỏi về sản lượng, bảo trì..."
                className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 focus:border-blue-400 focus:outline-none bg-gray-50 focus:bg-white transition-all"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
              >
                <Send size={14} className="text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center"
        style={{ width: 54, height: 54, borderRadius: 16, background: "linear-gradient(135deg, #3b82f6, #6366f1)", boxShadow: "0 8px 24px rgba(59,130,246,0.4)" }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X size={22} className="text-white" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle size={22} className="text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Pulse ring */}
        {!open && (
          <span className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ background: "#3b82f6" }} />
        )}
      </motion.button>
    </div>
  );
}
