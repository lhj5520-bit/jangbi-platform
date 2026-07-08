import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qeurmytrzghonavsiqwa.supabase.co'
const SUPABASE_KEY = 'sb_publishable__0bJglvBcoxEJG69x5sxeQ_KTg0Hzzp'

let instance: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    // SSR/정적 빌드 중 mock 반환
    const resolved = Promise.resolve({ data: null, error: null, count: null })
    const chain: unknown = new Proxy(
      Object.assign(() => resolved, { then: (r: (v: unknown) => unknown) => resolved.then(r) }),
      { get: (_t, _k) => chain }
    )
    const noop = () => {}
    return {
      from: () => chain,
      auth: {
        signInWithPassword: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: noop } } }),
      },
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
    } as unknown as SupabaseClient
  }

  if (!instance) {
    instance = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return instance
}
