'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Client } from '@/lib/types'
import ProjectModal from './ProjectModal'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<Project | null>(null)
  const supabase = createClient()

  async function load() {
    const [{ data: proj }, { data: cli }] = await Promise.all([
      supabase.from('projects').select('*, client:clients(*)').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
    ])
    setProjects(proj ?? [])
    setClients(cli ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = projects.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    const matchSearch = p.name.includes(search) ||
      (p.location ?? '').includes(search) ||
      (p.client as Client)?.name?.includes(search)
    return matchStatus && matchSearch
  })

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        alert('이 현장에 연결된 배차 또는 일보가 있어 삭제할 수 없습니다.\n먼저 해당 배차/일보를 삭제해 주세요.')
      } else {
        alert('삭제 실패: ' + error.message)
      }
      return
    }
    load()
  }

  const statusLabel: Record<string, string> = { active: '진행중', completed: '완료', cancelled: '취소' }
  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">현장 / 수주</h1>
        <button onClick={() => { setSelected(null); setModalOpen(true) }}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + 등록
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="현장명, 발주처, 위치 검색..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
          {(['all', 'active', 'completed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 'all' ? '전체' : s === 'active' ? '진행중' : '완료'}
            </button>
          ))}
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden space-y-3">
        {loading
          ? <div className="text-center py-8 text-gray-400">불러오는 중...</div>
          : filtered.length === 0
          ? <div className="text-center py-8 text-gray-400">등록된 현장이 없습니다.</div>
          : filtered.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-gray-900">{p.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{(p.client as Client)?.name ?? ''}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ml-2 ${statusColor[p.status]}`}>
                  {statusLabel[p.status]}
                </span>
              </div>
              <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                {p.location && <div>위치: {p.location}</div>}
                {p.start_date && <div>기간: {p.start_date}{p.end_date ? ` ~ ${p.end_date}` : ''}</div>}
              </div>
              <div className="mt-3 flex gap-3 pt-3 border-t border-gray-100">
                <button onClick={() => { setSelected(p); setModalOpen(true) }}
                  className="flex-1 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">수정</button>
                <button onClick={() => handleDelete(p.id)}
                  className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-500 text-sm font-medium">삭제</button>
              </div>
            </div>
          ))
        }
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">현장명</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">발주처</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">위치</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">시작일</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">종료일</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">상태</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">등록된 현장이 없습니다.</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-5 py-3 text-gray-600">{(p.client as Client)?.name ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500">{p.location ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500">{p.start_date ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500">{p.end_date ?? '-'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setSelected(p); setModalOpen(true) }}
                      className="text-xs text-blue-600 hover:underline">수정</button>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ProjectModal project={selected} clients={clients}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}
    </div>
  )
}
