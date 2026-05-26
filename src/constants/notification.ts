export const NOTIFICATION_EVENTS = {
  STATION_CHECK_IN: "station_check_in",
  STATION_CHECK_OUT: "station_check_out",
  VEHICLE_CHECK_IN: "vehicle_check_in",
  VEHICLE_CHECK_OUT: "vehicle_check_out",
  STATION_CHECKOUT_VEHICLE_CHECKIN_WARNING: "station_checkout_vehicle_checkin_warning",
  STATION_CHECKOUT_VEHICLE_CHECKIN_TIMEOUT_RESET: "station_checkout_vehicle_checkin_timeout_reset",
  PARKING_IDLE_ENGINE_WARNING: "parking_idle_engine_warning",
  PARKING_IDLE_ENGINE_WARNING_RESOLVED: "parking_idle_engine_warning:resolved",
} as const;

export const NOTIFICATION_EVENT_TRANSLATION_KEYS = {
  [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "station_check_in",
  [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "station_check_out",
  [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "vehicle_check_in",
  [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "vehicle_check_out",
  [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_WARNING]: "station_checkout_vehicle_checkin_warning",
  [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_TIMEOUT_RESET]: "station_checkout_vehicle_checkin_timeout_reset",
  [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING]: "parking_idle_engine_warning",
  [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING_RESOLVED]: "parking_idle_engine_warning_resolved",
} as const;
