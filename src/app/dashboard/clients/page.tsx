'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/lib/types'
import ClientModal from './ClientModal'
import CsvUploadModal from './CsvUploadModal'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [sortKey, setSortKey] = useState<string>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const supabase = createClient()

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  function sortIcon(key: string) {
    if (sortKey !== key) return ' ↕'
    return sortAsc ? ' ↑' : ' ↓'
  }

  async function load() {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    setClients(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = clients.filter(c =>
    c.name.includes(search) || (c.ceo_name ?? '').includes(search) || (c.contact ?? '').includes(search)
  ).sort((a, b) => {
    if (!sortKey) return 0
    let av: string, bv: string
    if (sortKey === 'name') { av = a.name ?? ''; bv = b.name ?? '' }
    else if (sortKey === 'ceo_name') { av = a.ceo_name ?? ''; bv = b.ceo_name ?? '' }
    else if (sortKey === 'contact') { av = a.contact ?? ''; bv = b.contact ?? '' }
    else if (sortKey === 'business_no') { av = a.business_no ?? ''; bv = b.business_no ?? '' }
    else if (sortKey === 'address') { av = a.address ?? ''; bv = b.address ?? '' }
    else { av = ''; bv = '' }
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('clients').delete().eq('id', id)
    load()
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">발주처</h1>
        <div className="flex gap-2">
          <button onClick={() => setCsvOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            CSV
          </button>
          <button onClick={() => { setSelected(null); setModalOpen(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            + 등록
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="업체명, 대표자, 연락처 검색..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">등록된 발주처가 없습니다.</div>
        ) : filtered.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-gray-900">{c.name}</div>
                <div className="text-sm text-gray-500 mt-0.5">{c.ceo_name ?? ''}</div>
              </div>
              {c.contact && (
                <a href={`tel:${c.contact}`} className="text-blue-600 text-sm shrink-0 ml-2">
                  {c.contact}
                </a>
              )}
            </div>
            {(c.business_no || c.address) && (
              <div className="mt-2 text-xs text-gray-400 space-y-0.5">
                {c.business_no && <div>사업자번호: {c.business_no}</div>}
                {c.address && <div>{c.address}</div>}
              </div>
            )}
            <div className="mt-3 flex gap-3 pt-3 border-t border-gray-100">
              <button onClick={() => { setSelected(c); setModalOpen(true) }}
                className="flex-1 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">수정</button>
              <button onClick={() => handleDelete(c.id)}
                className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-500 text-sm font-medium">삭제</button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {[
                { key: 'name', label: '업체명' },
                { key: 'ceo_name', label: '대표자' },
                { key: 'contact', label: '연락처' },
                { key: 'business_no', label: '사업자번호' },
                { key: 'address', label: '주소' },
              ].map(col => (
                <th key={col.key}
                  className="text-left px-5 py-3 font-semibold text-gray-600 cursor-pointer hover:text-blue-600 select-none"
                  onClick={() => toggleSort(col.key)}>
                  {col.label}<span className="text-gray-400 text-xs">{sortIcon(col.key)}</span>
                </th>
              ))}
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">등록된 발주처가 없습니다.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-5 py-3 text-gray-600">{c.ceo_name ?? '-'}</td>
                <td className="px-5 py-3 text-gray-600">{c.contact ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500">{c.business_no ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500">{c.address ?? '-'}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setSelected(c); setModalOpen(true) }}
                      className="text-xs text-blue-600 hover:underline">수정</button>
                    <button onClick={() => handleDelete(c.id)}
                      className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ClientModal client={selected} onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}
      {csvOpen && (
        <CsvUploadModal onClose={() => setCsvOpen(false)}
          onSaved={() => { setCsvOpen(false); load() }} />
      )}
    </div>
  )
}
