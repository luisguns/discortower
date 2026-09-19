export function scrub<T>(value: T): T
export function cleanText(value: string): string
export function prepareEvent<T>(event: T, origin: string, processName: string, sessionId: string): T
export function createBudget(limit: number, windowMs: number, now?: () => number): () => boolean
