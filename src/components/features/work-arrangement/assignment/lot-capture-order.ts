type LotOrderItem = {
  order_id: number | string;
  vehicle_id: number | string;
  group?: string;
  order_status?: string;
};

export const getLotItemKey = (item: LotOrderItem) => `${item.order_id}:${item.vehicle_id}`;

export const isPersistedLotOrderItem = (item: LotOrderItem) =>
  Number(item.order_id) > 0 && item.group !== "unreturned";

// Đơn thực sự đang "chờ lốt": chỉ nhóm pending mới nằm trong hàng đợi rút-chèn của backend.
// Xe đang chạy (running/transporting) hay chưa về (unreturned) không tính vào vị trí lốt.
export const isPendingLotOrderItem = (item: LotOrderItem) => {
  if (!isPersistedLotOrderItem(item)) return false;
  const status = String(item.order_status ?? item.group ?? "").toLowerCase();
  return status === "pending";
};

const moveLotItemToIndex = <T>(items: T[], fromIndex: number, toIndex: number) => {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    toIndex === fromIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export const moveLotItemByDirection = <T extends LotOrderItem>(
  items: T[],
  itemKey: string,
  direction: -1 | 1
) => {
  const fromIndex = items.findIndex((item) => getLotItemKey(item) === itemKey);
  return moveLotItemToIndex(items, fromIndex, fromIndex + direction);
};

export const moveLotItemToPosition = <T extends LotOrderItem>(
  items: T[],
  itemKey: string,
  toPosition: number
) => {
  const fromIndex = items.findIndex((item) => getLotItemKey(item) === itemKey);
  return moveLotItemToIndex(items, fromIndex, toPosition - 1);
};

export const getPersistedLotOrderPosition = <T extends LotOrderItem>(
  items: T[],
  itemKey: string
) => {
  const persistedItems = items.filter(isPersistedLotOrderItem);
  const persistedIndex = persistedItems.findIndex((item) => getLotItemKey(item) === itemKey);
  return persistedIndex >= 0 ? persistedIndex + 1 : 0;
};

/**
 * Xếp lốt theo nhóm tag (nhóm nhỏ đứng trước): stable sort — trong cùng nhóm giữ nguyên
 * thứ tự hiện tại; item không persist (Chưa về) giữ nguyên ở cuối. Không đổi gì → trả lại
 * đúng mảng cũ để caller bỏ qua persist.
 */
export const sortLotItemsByGroup = <T extends LotOrderItem>(
  items: T[],
  groupByVehicleId: Map<number, number>,
  defaultGroup = 20
): T[] => {
  const persistedItems = items.filter(isPersistedLotOrderItem);
  const otherItems = items.filter((item) => !isPersistedLotOrderItem(item));
  const sortedPersisted = [...persistedItems].sort((a, b) => {
    const groupA = groupByVehicleId.get(Number(a.vehicle_id)) ?? defaultGroup;
    const groupB = groupByVehicleId.get(Number(b.vehicle_id)) ?? defaultGroup;
    return groupA - groupB;
  });

  const changed = sortedPersisted.some((item, index) => item !== persistedItems[index]);
  return changed ? [...sortedPersisted, ...otherItems] : items;
};

export type LotOrderMoveUpdate = { itemKey: string; orderId: number; targetPosition: number };

/**
 * Chuỗi lệnh "chuyển tới vị trí" tuần tự (mô phỏng thao tác tay từng xe, từ vị trí 1 trở đi)
 * để biến previousItems → nextItems. Backend xử lý mỗi PUT như một lần rút-chèn nên áp dụng
 * theo thứ tự tăng dần vị trí đích sẽ ra đúng thứ tự cuối cùng.
 */
export const getLotOrderMoveUpdates = <T extends LotOrderItem>(
  previousItems: T[],
  nextItems: T[]
): LotOrderMoveUpdate[] => {
  const workingKeys = previousItems.filter(isPersistedLotOrderItem).map(getLotItemKey);
  const updates: LotOrderMoveUpdate[] = [];

  nextItems.filter(isPersistedLotOrderItem).forEach((item, index) => {
    const itemKey = getLotItemKey(item);
    const fromIndex = workingKeys.indexOf(itemKey);
    if (fromIndex < 0 || fromIndex === index) return;
    workingKeys.splice(fromIndex, 1);
    workingKeys.splice(index, 0, itemKey);
    updates.push({ itemKey, orderId: Number(item.order_id), targetPosition: index + 1 });
  });

  return updates;
};

/**
 * Chuỗi lệnh "chuyển tới vị trí" cho TOÀN BỘ đơn pending theo đúng thứ tự đang hiển thị
 * (vị trí 1 → hết). Dùng khi "Chụp lốt" để ép order_number trên backend khớp thứ tự đã sắp,
 * kể cả khi người dùng không bấm nút sắp xếp từng xe. Áp dụng tăng dần vị trí đích nên mỗi
 * PUT rút-chèn cố định dần phần đầu, hội tụ đúng thứ tự cuối.
 */
export const getFullLotOrderUpdates = <T extends LotOrderItem>(
  items: T[]
): LotOrderMoveUpdate[] =>
  items.filter(isPendingLotOrderItem).map((item, index) => ({
    itemKey: getLotItemKey(item),
    orderId: Number(item.order_id),
    targetPosition: index + 1,
  }));

export const getPersistedLotOrderUpdates = <T extends LotOrderItem>(
  items: T[],
  itemKeys: string[]
) => {
  const uniqueItemKeys = Array.from(new Set(itemKeys));

  return uniqueItemKeys
    .map((itemKey) => {
      const item = items.find((entry) => getLotItemKey(entry) === itemKey);
      const targetPosition = getPersistedLotOrderPosition(items, itemKey);
      if (!item || !isPersistedLotOrderItem(item) || targetPosition < 1) return null;
      return {
        itemKey,
        orderId: Number(item.order_id),
        targetPosition,
      };
    })
    .filter((update): update is { itemKey: string; orderId: number; targetPosition: number } =>
      Boolean(update)
    )
    .sort((a, b) => b.targetPosition - a.targetPosition);
};
