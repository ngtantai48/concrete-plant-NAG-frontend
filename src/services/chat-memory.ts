export interface MemoryEntry {
  tool: string;
  args: Record<string, unknown>;
  data: unknown;
  ts: number;
}

const MAX_ENTRIES = 3;
const entries: MemoryEntry[] = [];

export function rememberToolCall(entry: Omit<MemoryEntry, "ts">): void {
  entries.push({ ...entry, ts: Date.now() });
  while (entries.length > MAX_ENTRIES) entries.shift();
}

export function getMemorySnapshot(): readonly MemoryEntry[] {
  return entries;
}

export function hasMemory(): boolean {
  return entries.length > 0;
}

export function clearMemory(): void {
  entries.length = 0;
}
