'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/lib/types'
import ClientModal from './ClientModal'
import PageHeader from '@/components/PageHeader'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
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

  async function handleExcelDownload() {
    const XLSX = await import('xlsx')
    const header = ['업체명','대표자','연락처','사업자번호','주소','이메일','메모']
    const rows = filtered.map(c => [c.name ?? '', c.ceo_name ?? '', c.contact ?? '', c.business_no ?? '', c.address ?? '', (c as any).email ?? '', (c as any).memo ?? ''])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '발주처')
    XLSX.writeFile(wb, '발주처목록.xlsx')
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('clients').delete().eq('id', id)
    load()
  }

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="발주처"
        subtitle={`${filtered.length}곳`}
        primary={{ label: '+ 발주처 등록', onClick: () => { setSelected(null); setModalOpen(true) } }}
        secondary={[{ label: '⬇ 엑셀 다운로드', onClick: handleExcelDownload }]}
      />

      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-[#f3f0ea] px-4 py-2 md:static md:mx-0 md:bg-transparent md:p-0 md:pb-4">
        <input type="text" placeholder="업체명, 대표자, 연락처 검색..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 md:py-2 md:text-sm" />
      </div>

      <div className="touch-list md:hidden space-y-3">
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
            <div className="mt-3 flex gap-2 pt-3 border-t border-gray-100">
              <button onClick={() => { setSelected(c); setModalOpen(true) }}
                className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white">수정</button>
              <button onClick={() => handleDelete(c.id)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-500">삭제</button>
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
    </div>
  )
}
