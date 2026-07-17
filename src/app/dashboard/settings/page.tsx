'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const ALL_MENUS = [
  { path: '/dashboard', label: '대시보드' },
  { path: '/dashboard/clients', label: '발주처' },
  { path: '/dashboard/suppliers', label: '중기업체' },
  { path: '/dashboard/equipment-own', label: '장비(자차)' },
  { path: '/dashboard/equipment-other', label: '장비(타사)' },
  { path: '/dashboard/dispatches', label: '배차 등록' },
  { path: '/dashboard/daily-logs', label: '작업확인서출력' },
  { path: '/dashboard/dispatch-ledger', label: '배차내역서' },
  { path: '/dashboard/trade-statement', label: '거래명세서' },
  { path: '/dashboard/invoices', label: '매출계산서' },
  { path: '/dashboard/purchase-invoices', label: '매입계산서' },
  { path: '/dashboard/vat', label: '부가세' },
  { path: '/dashboard/bank', label: '통장내역' },
  { path: '/dashboard/expenses', label: '관리비' },
  { path: '/dashboard/equipment-costs', label: '장비별 투입비용' },
  { path: '/dashboard/sole-proprietor', label: '개인사업자관리' },
  { path: '/dashboard/export', label: '전체 내려받기' },
]

export default function SettingsPage() {
  const supabase = createClient()

  // 계정 추가
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 내 비밀번호 변경
  const [myPw, setMyPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 유저 목록 + 권한
  const [users, setUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [savingPerm, setSavingPerm] = useState<string | null>(null)
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null))
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoadingUsers(true)
    const res = await fetch('/api/users')
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoadingUsers(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateMsg(null)
    const res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCreateMsg({ type: 'err', text: `❌ ${data.error}` })
    } else {
      setCreateMsg({ type: 'ok', text: `✅ ${newEmail} 계정 생성 완료` })
      setNewEmail(''); setNewPassword('')
      loadUsers()
    }
    setCreating(false)
  }

  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault()
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: myPw })
    if (error) setPwMsg({ type: 'err', text: `❌ ${error.message}` })
    else { setPwMsg({ type: 'ok', text: '✅ 비밀번호 변경 완료' }); setMyPw('') }
    setPwSaving(false)
  }

  async function savePerm(userId: string, isAdmin: boolean, paths: string[]) {
    setSavingPerm(userId)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, is_admin: isAdmin, allowed_paths: paths }),
    })
    const data = await res.json()
    setSavingPerm(null)
    if (!res.ok) {
      alert('저장 실패: ' + (data.error ?? '알 수 없는 오류'))
      return
    }
    setUsers(us => us.map(u => u.id === userId ? { ...u, is_admin: isAdmin, allowed_paths: paths } : u))
    alert('✅ 저장됐습니다.')
  }

  function togglePath(userId: string, path: string) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    const paths: string[] = user.allowed_paths.includes(path)
      ? user.allowed_paths.filter((p: string) => p !== path)
      : [...user.allowed_paths, path]
    setUsers(us => us.map(u => u.id === userId ? { ...u, allowed_paths: paths } : u))
  }

  function toggleAdmin(userId: string) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    setUsers(us => us.map(u => u.id === userId ? { ...u, is_admin: !u.is_admin } : u))
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">계정 설정</h1>

      {/* 계정 추가 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">새 계정 추가</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required
            placeholder="이메일" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required
            placeholder="초기 비밀번호 (6자 이상)" minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" disabled={creating}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg text-sm">
            {creating ? '생성 중...' : '계정 생성'}
          </button>
          {createMsg && <p className={`text-sm px-3 py-2 rounded-lg ${createMsg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{createMsg.text}</p>}
        </form>
      </div>

      {/* 메뉴 권한 설정 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">계정별 메뉴 권한</h2>
        {loadingUsers ? (
          <p className="text-sm text-gray-400">불러오는 중...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-400">계정이 없습니다.</p>
        ) : (
          <div className="space-y-6">
            {users.map(u => (
              <div key={u.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-gray-800 text-sm">{u.email}</span>
                    {u.id === myId && <span className="ml-2 text-xs text-blue-500">(나)</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={u.is_admin}
                        onChange={() => toggleAdmin(u.id)}
                        className="w-4 h-4 accent-orange-500" />
                      <span className="text-orange-600 font-medium">관리자 (전체접근)</span>
                    </label>
                    <button onClick={() => savePerm(u.id, u.is_admin, u.allowed_paths)}
                      disabled={savingPerm === u.id}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
                      {savingPerm === u.id ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
                {!u.is_admin && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_MENUS.map(m => (
                      <label key={m.path} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded-lg">
                        <input type="checkbox"
                          checked={u.allowed_paths.includes(m.path)}
                          onChange={() => togglePath(u.id, m.path)}
                          className="w-3.5 h-3.5 accent-blue-600" />
                        <span className="text-gray-700">{m.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                {u.is_admin && (
                  <p className="text-xs text-gray-400 mt-1">관리자는 모든 메뉴에 접근할 수 있습니다.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 내 비밀번호 변경 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">내 비밀번호 변경</h2>
        <form onSubmit={handleChangePw} className="space-y-3">
          <input type="password" value={myPw} onChange={e => setMyPw(e.target.value)} required
            placeholder="새 비밀번호 (6자 이상)" minLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit" disabled={pwSaving}
            className="w-full bg-gray-700 hover:bg-gray-800 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg text-sm">
            {pwSaving ? '변경 중...' : '비밀번호 변경'}
          </button>
          {pwMsg && <p className={`text-sm px-3 py-2 rounded-lg ${pwMsg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{pwMsg.text}</p>}
        </form>
      </div>
    </div>
  )
}
