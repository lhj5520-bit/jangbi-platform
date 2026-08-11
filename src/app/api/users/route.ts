import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qeurmytrzghonavsiqwa.supabase.co'
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function adminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) throw new Error('Service role key not configured')
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/** 호출자가 로그인된 관리자인지 확인. 관리자 supabase client 반환 */
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const admin = adminClient()
  const { data: perm } = await admin.from('user_permissions').select('is_admin').eq('user_id', user.id).single()
  if (!perm?.is_admin) return null

  return admin
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: { users }, error } = await admin.auth.admin.listUsers()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { data: perms } = await admin.from('user_permissions').select('*')
    const permMap = Object.fromEntries((perms ?? []).map((p: any) => [p.user_id, p]))

    const result = users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      is_admin: permMap[u.id]?.is_admin ?? false,
      allowed_paths: permMap[u.id]?.allowed_paths ?? [],
    }))

    return NextResponse.json({ users: result })
  } catch (e: any) {
    console.error('users GET error:', e)
    return NextResponse.json({ error: e?.message ?? '알 수 없는 오류' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { user_id, is_admin, allowed_paths } = await req.json()

    const { error } = await admin.from('user_permissions').upsert(
      { user_id, is_admin, allowed_paths },
      { onConflict: 'user_id' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('users POST error:', e)
    return NextResponse.json({ error: e?.message ?? '알 수 없는 오류' }, { status: 500 })
  }
}
