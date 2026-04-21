import React, { useEffect, useRef, useState } from 'react';

interface ClockDisplayProps {
  locale: string;
}

/**
 * Component hiển thị đồng hồ realtime.
 * Tách riêng để tránh re-render toàn bộ AdminDashboard mỗi giây.
 */
const ClockDisplay = ({ locale }: ClockDisplayProps) => {
  const [clock, setClock] = useState("");
  const clockRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    };
    tick();
    clockRef.current = setInterval(tick, 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [locale]);

  return (
    <span
      className="text-xs font-bold uppercase whitespace-nowrap"
      style={{ color: 'var(--dd-text-muted)' }}
    >
      {clock}
    </span>
  );
};

export default React.memo(ClockDisplay);
