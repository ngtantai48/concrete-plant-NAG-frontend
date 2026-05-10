import React, { useEffect, useRef, useState } from 'react';

interface ClockDisplayProps {
  locale: string;
}

/**
 * Component hiển thị đồng hồ realtime.
 * Tách riêng để tránh re-render toàn bộ AdminDashboard mỗi giây.
 */
const ClockDisplay = ({ locale }: ClockDisplayProps) => {
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const clockRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const localeCode = locale === 'vi' ? 'vi-VN' : 'en-US';

      setDateStr(
        now.toLocaleDateString(localeCode, {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      );

      setTimeStr(
        now.toLocaleTimeString(localeCode, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [locale]);

  return (
    <div className="flex flex-col items-start leading-tight">
      <span className="text-xs font-medium opacity-80 whitespace-nowrap">
        {dateStr}
      </span>
      <span className="text-xs font-black tabular-nums tracking-wider whitespace-nowrap text-slate-800">
        {timeStr}
      </span>
    </div>
  );
};

export default React.memo(ClockDisplay);
