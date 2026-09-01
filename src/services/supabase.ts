import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || ''
const MAX_SESSION_BYTES = 256 * 1024
const AUTH_STORAGE_KEY = 'splotys.auth.session'

class MemorySessionStorage implements Storage {
  private readonly values = new Map<string, string>()

  constructor(initialValue: string | null, private readonly persist: (value: string | null) => void) {
    if (initialValue) this.values.set(AUTH_STORAGE_KEY, initialValue)
  }

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
    void this.persist(null)
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
    if (key === AUTH_STORAGE_KEY) void this.persist(null)
  }

  setItem(key: string, value: string) {
    if (value.length > MAX_SESSION_BYTES) throw new Error('AUTH_SESSION_TOO_LARGE')
    this.values.set(key, value)
    if (key === AUTH_STORAGE_KEY) void this.persist(value)
  }
}

let client: SupabaseClient | null = null
let clientPromise: Promise<SupabaseClient> | null = null

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

const getBrowserStorage = () => {
  try {
    return window.localStorage
  } catch {
    return new MemorySessionStorage(null, () => undefined)
  }
}

const createStorage = (initialValue: string | null) => {
  const desktop = window.splotysDesktop
  if (!desktop) {
    const browserStorage = getBrowserStorage()
    return browserStorage
  }

  return new MemorySessionStorage(initialValue, (value) => {
    if (value === null) return desktop.clearAuthSession().then(() => undefined)
    return desktop.setAuthSessionBlob(value).then(() => undefined)
  })
}

const loadInitialSession = async () => {
  if (window.splotysDesktop) return window.splotysDesktop.getAuthSessionBlob()
  return getBrowserStorage().getItem(AUTH_STORAGE_KEY)
}

export const initializeSupabase = async () => {
  if (client) return client
  if (clientPromise) return clientPromise
  if (!isSupabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED')

  clientPromise = loadInitialSession().then((initialSession) => {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        persistSession: true,
        storageKey: AUTH_STORAGE_KEY,
        storage: createStorage(initialSession),
      },
    })
    return client
  })

  try {
    return await clientPromise
  } catch (error) {
    clientPromise = null
    throw error
  }
}

export const getSupabase = () => {
  if (!client) throw new Error('SUPABASE_NOT_INITIALIZED')
  return client
}
