export const NOTIFICATION_EVENTS = {
  STATION_CHECK_IN: "station_check_in",
  STATION_CHECK_OUT: "station_check_out",
  VEHICLE_CHECK_IN: "vehicle_check_in",
  VEHICLE_CHECK_OUT: "vehicle_check_out",
} as const;

export const NOTIFICATION_EVENT_TRANSLATION_KEYS = {
  [NOTIFICATION_EVENTS.STATION_CHECK_IN]: "station_check_in",
  [NOTIFICATION_EVENTS.STATION_CHECK_OUT]: "station_check_out",
  [NOTIFICATION_EVENTS.VEHICLE_CHECK_IN]: "vehicle_check_in",
  [NOTIFICATION_EVENTS.VEHICLE_CHECK_OUT]: "vehicle_check_out",
} as const;
