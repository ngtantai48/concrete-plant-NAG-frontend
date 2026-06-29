type LotOrderItem = {
  order_id: number | string;
  vehicle_id: number | string;
  group?: string;
};

export const getLotItemKey = (item: LotOrderItem) => `${item.order_id}:${item.vehicle_id}`;

export const isPersistedLotOrderItem = (item: LotOrderItem) =>
  Number(item.order_id) > 0 && item.group !== "unreturned";

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
