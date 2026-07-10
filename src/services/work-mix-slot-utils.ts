type MixSlotOrderStatus =
  | "init"
  | "pending"
  | "collecting"
  | "transporting"
  | "running"
  | "completed"
  | "canceled";

type MixSlotVehicle = {
  vehicle_id?: number | string | null;
  vehicle_name?: string | null;
  vehicle_license_plate?: string | null;
  vehicle_type_id?: number | string | null;
  vehicle_type_symbol?: string | null;
  vehicle_status?: string | null;
  user_id?: number | string | null;
};

type MixSlotOrder = {
  order_id?: number | string;
  order_number?: number | string;
  order_status?: MixSlotOrderStatus;
  shift_closing?: { shift_status?: number | string | null } | null;
  users?: {
    user_id?: number | string | null;
    user_full_name?: string | null;
  } | null;
  vehicles?: MixSlotVehicle | null;
};

type BuildWorkMixSlotItemsOptions = {
  orders: MixSlotOrder[];
  vehicles?: MixSlotVehicle[];
  symbolByTypeId: Map<number, string | null>;
  shortNameByUserId: Map<number, string>;
  includeAllMixerVehicles?: boolean;
};

type BuiltWorkMixSlotItem = {
  order_id: number;
  order_number: number;
  order_status?: MixSlotOrderStatus;
  group?: "pending" | "running" | "unreturned" | string;
  user_id: number;
  vehicle_id: number;
  vehicle_name: string | null;
  vehicle_license_plate: string;
  vehicle_type_symbol: string | null;
  short_name: string;
  code: string;
  label: string;
};

const MIX_SLOT_EXCLUDED_VEHICLE_STATUSES = new Set(["maintenance", "incident", "other"]);
const SYMBOL_MIXER = "x";

export const normalizeWorkTypeValue = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .trim();

const getLastNameWord = (value?: string | null) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .pop() || "";

export const getDisplayShortName = (fullName?: string | null, shortName?: string | null) => {
  const short = String(shortName || "").trim();
  if (short) return short;
  return getLastNameWord(fullName) || String(fullName || "").trim();
};

const getVehicleSymbol = (
  vehicle: MixSlotVehicle | null | undefined,
  symbolByTypeId: Map<number, string | null>
) => {
  if (!vehicle) return null;
  return vehicle.vehicle_type_symbol || symbolByTypeId.get(Number(vehicle.vehicle_type_id)) || null;
};

const getMixSlotCode = (symbol?: string | null, licensePlate?: string | null) => {
  if (normalizeWorkTypeValue(symbol) === SYMBOL_MIXER) {
    const digits = String(licensePlate || "").replace(/\D/g, "");
    return digits.slice(-3) || String(licensePlate || "").trim();
  }
  return "XB";
};

const buildMixSlotLabel = (shortName: string, code: string) =>
  [shortName, code].filter(Boolean).join("_") || code;

const compareVehicleByName = (a: MixSlotVehicle, b: MixSlotVehicle) => {
  const key = (vehicle: MixSlotVehicle) =>
    vehicle.vehicle_name || vehicle.vehicle_license_plate || `#${vehicle.vehicle_id}`;
  return key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: "base" });
};

const isMixerVehicle = (
  vehicle: MixSlotVehicle | null | undefined,
  symbolByTypeId: Map<number, string | null>
) => normalizeWorkTypeValue(getVehicleSymbol(vehicle, symbolByTypeId)) === SYMBOL_MIXER;

const mapOrderToMixSlotItem = (
  order: MixSlotOrder,
  symbolByTypeId: Map<number, string | null>,
  shortNameByUserId: Map<number, string>
): BuiltWorkMixSlotItem => {
  const vehicle = order.vehicles;
  const symbol = getVehicleSymbol(vehicle, symbolByTypeId);
  const userId = Number(order.users?.user_id) || 0;
  const shortName =
    shortNameByUserId.get(userId) ?? getDisplayShortName(order.users?.user_full_name, null);
  const code = getMixSlotCode(symbol, vehicle?.vehicle_license_plate);

  return {
    order_id: Number(order.order_id),
    order_number: Number(order.order_number) || 0,
    order_status: order.order_status,
    group: order.order_status === "pending" ? "pending" : "running",
    user_id: userId,
    vehicle_id: Number(vehicle?.vehicle_id) || 0,
    vehicle_name: vehicle?.vehicle_name ?? null,
    vehicle_license_plate: vehicle?.vehicle_license_plate || "",
    vehicle_type_symbol: symbol,
    short_name: shortName,
    code,
    label: buildMixSlotLabel(shortName, code),
  };
};

const mapVehicleToUnreturnedMixSlotItem = (
  vehicle: MixSlotVehicle,
  symbolByTypeId: Map<number, string | null>
): BuiltWorkMixSlotItem => {
  const vehicleId = Number(vehicle.vehicle_id) || 0;
  const symbol = getVehicleSymbol(vehicle, symbolByTypeId);
  const code = getMixSlotCode(symbol, vehicle.vehicle_license_plate);

  return {
    order_id: -vehicleId,
    order_number: Number.MAX_SAFE_INTEGER,
    group: "unreturned",
    user_id: Number(vehicle.user_id) || 0,
    vehicle_id: vehicleId,
    vehicle_name: vehicle.vehicle_name ?? null,
    vehicle_license_plate: vehicle.vehicle_license_plate || "",
    vehicle_type_symbol: symbol,
    short_name: "",
    code,
    label: buildMixSlotLabel("", code),
  };
};

export const buildWorkMixSlotItems = ({
  orders,
  vehicles = [],
  symbolByTypeId,
  shortNameByUserId,
  includeAllMixerVehicles = false,
}: BuildWorkMixSlotItemsOptions): BuiltWorkMixSlotItem[] => {
  const orderedItems = orders
    .filter((order) => order.shift_closing?.shift_status !== 1)
    .filter((order) => {
      const status = order.vehicles?.vehicle_status?.toLowerCase();
      return !status || !MIX_SLOT_EXCLUDED_VEHICLE_STATUSES.has(status);
    })
    .filter((order) => Number(order.vehicles?.vehicle_id) > 0)
    .filter((order) => isMixerVehicle(order.vehicles, symbolByTypeId))
    .sort((a, b) => {
      const aPending = a.order_status === "pending";
      const bPending = b.order_status === "pending";
      if (aPending !== bPending) return aPending ? -1 : 1;
      return (Number(a.order_number) || 0) - (Number(b.order_number) || 0);
    })
    .map((order) => mapOrderToMixSlotItem(order, symbolByTypeId, shortNameByUserId));

  if (!includeAllMixerVehicles) return orderedItems;

  const includedVehicleIds = new Set(orderedItems.map((item) => item.vehicle_id));
  const unreturnedItems = vehicles
    .filter((vehicle) => Number(vehicle.vehicle_id) > 0)
    .filter((vehicle) => isMixerVehicle(vehicle, symbolByTypeId))
    .filter((vehicle) => !includedVehicleIds.has(Number(vehicle.vehicle_id)))
    .sort(compareVehicleByName)
    .map((vehicle) => mapVehicleToUnreturnedMixSlotItem(vehicle, symbolByTypeId));

  return [...orderedItems, ...unreturnedItems];
};
