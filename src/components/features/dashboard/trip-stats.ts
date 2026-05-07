import type { Order } from '@/types/order';

export interface TripStats {
  totalDistanceKm: number;
  totalStops: number;
  totalStopSecs: number;
  totalTimeMs: number;
  totalMixMs: number;
  // Pre-formatted values
  totalMins: number;
  hours: number;
  mins: number;
  totalStopMins: number;
  stopHours: number;
  stopMinsRemain: number;
  totalMixMins: number;
  mixTotalHours: number;
  mixTotalMinsRemain: number;
}

/**
 * Tính toán thống kê chuyến đi cho một danh sách orders.
 * Trích xuất từ logic bị lặp 3 lần trong AdminDashboard.
 */
export function computeTripStats(trips: Order[]): TripStats {
  const totalDistanceKm = trips.reduce((sum, o) => {
    if (o.order_multi) return sum + (o.order_multi.distance_end - o.order_multi.distance_start);
    return sum;
  }, 0);

  const totalStops = trips.reduce((sum, o) => {
    if (o.order_multi) return sum + (o.order_multi.nStop_end - o.order_multi.nStop_start);
    return sum;
  }, 0);

  const totalStopSecs = trips.reduce((sum, o) => {
    if (o.order_multi && o.order_multi.stop_duration_seconds) return sum + o.order_multi.stop_duration_seconds;
    return sum;
  }, 0);

  const totalTimeMs = trips.reduce((sum, o) => {
    if (o.order_start_datetime && o.order_end_datetime) {
      return sum + (new Date(o.order_end_datetime).getTime() - new Date(o.order_start_datetime).getTime());
    }
    return sum;
  }, 0);

  const totalMixMs = trips.reduce((sum, o) => {
    const mixInVal = o.order_multi?.checkin_time_station || o.checkin_time_station;
    const mixOutVal = o.order_multi?.checkout_time_station || o.checkout_time_station;
    if (mixInVal && mixOutVal) {
      const diff = new Date(mixOutVal).getTime() - new Date(mixInVal).getTime();
      if (diff > 0) return sum + diff;
    }
    return sum;
  }, 0);

  const totalMins = Math.floor(totalTimeMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  const totalStopMins = Math.floor(totalStopSecs / 60);
  const stopHours = Math.floor(totalStopMins / 60);
  const stopMinsRemain = totalStopMins % 60;

  const totalMixMins = Math.floor(totalMixMs / 60000);
  const mixTotalHours = Math.floor(totalMixMins / 60);
  const mixTotalMinsRemain = totalMixMins % 60;

  return {
    totalDistanceKm,
    totalStops,
    totalStopSecs,
    totalTimeMs,
    totalMixMs,
    totalMins,
    hours,
    mins,
    totalStopMins,
    stopHours,
    stopMinsRemain,
    totalMixMins,
    mixTotalHours,
    mixTotalMinsRemain,
  };
}

/**
 * Format thời gian dừng thành chuỗi hiển thị.
 */
export function formatDuration(
  totalMins: number,
  hours: number,
  minsRemain: number,
  hourLabel: string,
  minuteLabel: string,
): string {
  return hours > 0
    ? `${hours} ${hourLabel} ${minsRemain} ${minuteLabel}`
    : `${totalMins} ${minuteLabel}`;
}
