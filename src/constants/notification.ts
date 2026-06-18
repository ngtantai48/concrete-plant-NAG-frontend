export const NOTIFICATION_EVENTS = {
  STATION_CHECK_IN: "station_check_in",
  STATION_CHECK_OUT: "station_check_out",
  VEHICLE_CHECK_IN: "vehicle_check_in",
  VEHICLE_CHECK_OUT: "vehicle_check_out",
  STATION_CHECKOUT_VEHICLE_CHECKIN_WARNING: "station_checkout_vehicle_checkin_warning",
  STATION_CHECKOUT_VEHICLE_CHECKIN_TIMEOUT_RESET: "station_checkout_vehicle_checkin_timeout_reset",
  PARKING_IDLE_ENGINE_WARNING: "parking_idle_engine_warning",
  PARKING_IDLE_ENGINE_WARNING_RESOLVED: "parking_idle_engine_warning:resolved",
  VEHICLE_MAINTENANCE_SUBMITTED: "vehicle_maintenance_submitted",
  VEHICLE_MAINTENANCE_CONFIRMED: "vehicle_maintenance_confirmed",
  VEHICLE_MAINTENANCE_REJECTED: "vehicle_maintenance_rejected",
  VEHICLE_MAINTENANCE_APPROVED: "vehicle_maintenance_approved",
  TANKER_LOT_SYNC: "tanker_lot_sync",
} as const;

export const NOTIFICATION_EVENT_TRANSLATION_KEYS = {
  [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "station_check_in",
  [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "station_check_out",
  [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "vehicle_check_in",
  [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "vehicle_check_out",
  [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_WARNING]:
    "station_checkout_vehicle_checkin_warning",
  [NOTIFICATION_EVENTS.STATION_CHECKOUT_VEHICLE_CHECKIN_TIMEOUT_RESET]:
    "station_checkout_vehicle_checkin_timeout_reset",
  [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING]: "parking_idle_engine_warning",
  [NOTIFICATION_EVENTS.PARKING_IDLE_ENGINE_WARNING_RESOLVED]:
    "parking_idle_engine_warning_resolved",
  [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_SUBMITTED]: "vehicle_maintenance_submitted",
  [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_CONFIRMED]: "vehicle_maintenance_confirmed",
  [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_REJECTED]: "vehicle_maintenance_rejected",
  [NOTIFICATION_EVENTS.VEHICLE_MAINTENANCE_APPROVED]: "vehicle_maintenance_approved",
  [NOTIFICATION_EVENTS.TANKER_LOT_SYNC]: "tanker_lot_sync",
} as const;
