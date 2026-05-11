export interface MemoryEntry {
  tool: string;
  args: Record<string, unknown>;
  data: unknown;
  createdAt: string;
}

const MAX_MEMORY = 8;
const memory: MemoryEntry[] = [];

export function rememberToolCall(entry: Omit<MemoryEntry, "createdAt">) {
  memory.unshift({
    ...entry,
    createdAt: new Date().toISOString(),
  });
  memory.splice(MAX_MEMORY);
}

export function getMemorySnapshot(): MemoryEntry[] {
  return memory.map((entry) => ({ ...entry }));
}

export function hasMemory(): boolean {
  return memory.length > 0;
}

export function clearMemory() {
  memory.splice(0, memory.length);
}
