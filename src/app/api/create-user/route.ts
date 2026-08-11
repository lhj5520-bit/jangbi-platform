import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qeurmytrzghonavsiqwa.supabase.co'
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

    // 호출자가 로그인된 관리자인지 확인
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user: caller } } = await userClient.auth.getUser()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: perm } = await admin.from('user_permissions').select('is_admin').eq('user_id', caller.id).single()
    if (!perm?.is_admin) return NextResponse.json({ error: 'Forbidden: 관리자만 계정을 생성할 수 있습니다.' }, { status: 403 })

    const { email, password } = await req.json()
    if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력하세요.' }, { status: 400 })

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // 기본 권한 레코드 생성 (is_admin: false, 메뉴 없음)
    await admin.from('user_permissions').insert({
      user_id: data.user.id,
      is_admin: false,
      allowed_paths: [],
    })

    return NextResponse.json({ user: data.user })
  } catch (e: any) {
    console.error('create-user error:', e)
    return NextResponse.json({ error: e?.message ?? '알 수 없는 오류' }, { status: 500 })
  }
}
