'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Equipment, Supplier } from '@/lib/types'
import EquipmentModal from './EquipmentModal'
import EquipmentExcelUploadModal from './ExcelUploadModal'

const ExcavatorIcon = ({ size = 20 }: { size?: number }) => (
  <img src="/icons/excavator.svg" alt="굴삭기" width={size} height={size} style={{ display: 'inline-block' }} />
)

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'excavator' | 'dump' | 'truck'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<Equipment | null>(null)
  const [excelOpen, setExcelOpen] = useState(false)
  const [sortKey, setSortKey] = useState<string>('plate_no')
  const [sortAsc, setSortAsc] = useState(true)
  const [sharingId, setSharingId] = useState<string | null>(null)

  async function handleShareDocs(equipmentId: string) {
    setSharingId(equipmentId)
    try {
      const supabase2 = createClient()
      const { data: docs } = await supabase2.from('documents').select('*').eq('ref_id', equipmentId)
      if (!docs || docs.length === 0) { alert('등록된 서류가 없습니다.'); setSharingId(null); return }
      const files: File[] = []
      for (const doc of docs) {
        const { data: { publicUrl } } = supabase2.storage.from('documents').getPublicUrl(doc.file_url)
        const resp = await fetch(publicUrl)
        const blob = await resp.blob()
        files.push(new File([blob], doc.file_name ?? '서류', { type: blob.type }))
      }
      if (typeof navigator.share === 'function' && navigator.canShare?.({ files })) {
        await navigator.share({ files, title: '서류 전송' })
      } else {
        for (const file of files) {
          const url = URL.createObjectURL(file)
          const a = document.createElement('a')
          a.href = url; a.download = file.name; a.click()
          URL.revokeObjectURL(url)
          await new Promise(r => setTimeout(r, 300))
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('공유 중 오류: ' + String(e))
    }
    setSharingId(null)
  }
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
    const [{ data: eq }, { data: sup }] = await Promise.all([
      supabase.from('equipment').select('*, supplier:suppliers(*)').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('status', 'active').order('name'),
    ])
    setEquipment(eq ?? [])
    setSuppliers(sup ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = equipment.filter(e => {
    const matchType = typeFilter === 'all' || e.type === typeFilter
    const matchSearch = (e.plate_no ?? '').includes(search) ||
      (e.model ?? '').includes(search) ||
      (e.supplier as Supplier)?.name?.includes(search)
    return matchType && matchSearch
  }).sort((a, b) => {
    if (!sortKey) return 0
    let av: any, bv: any
    if (sortKey === 'plate_no') { av = a.plate_no ?? ''; bv = b.plate_no ?? '' }
    else if (sortKey === 'spec') { av = a.spec ?? a.model ?? ''; bv = b.spec ?? b.model ?? '' }
    else if (sortKey === 'supplier') { av = (a.supplier as Supplier)?.name ?? ''; bv = (b.supplier as Supplier)?.name ?? '' }
    else if (sortKey === 'inspection_expire') { av = a.inspection_expire ?? '9999'; bv = b.inspection_expire ?? '9999' }
    else if (sortKey === 'insurance_expire') { av = a.insurance_expire ?? '9999'; bv = b.insurance_expire ?? '9999' }
    else if (sortKey === 'insurance_premium') { av = (a as any).insurance_premium ?? 0; bv = (b as any).insurance_premium ?? 0 }
    else if (sortKey === 'type') { av = a.type; bv = b.type }
    else if (sortKey === 'status') { av = a.status; bv = b.status }
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('equipment').delete().eq('id', id)
    load()
  }

  const statusLabel: Record<string, string> = {
    available: '대기', dispatched: '배차중', maintenance: '정비중'
  }
  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    dispatched: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-yellow-100 text-yellow-700',
  }

  function checkExpire(dateStr?: string, offsetDays = 0) {
    if (!dateStr) return null
    const [y, m, d] = dateStr.split('-').map(Number)
    const base = new Date(y, m - 1, d)
    base.setDate(base.getDate() + offsetDays)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days = Math.ceil((base.getTime() - today.getTime()) / 86400000)
    let badge: React.ReactNode
    if (days < 0) badge = <span className="text-red-700 font-semibold">만료({Math.abs(days)}일경과)</span>
    else if (days <= 7) badge = <span className="text-red-600 font-semibold">D-{days}</span>
    else if (days <= 60) badge = <span className="text-yellow-600 font-semibold">D-{days}</span>
    else badge = <span className="text-gray-500">D-{days}</span>
    return (
      <span className="flex flex-col leading-tight">
        <span className="text-gray-700 text-xs">{dateStr}</span>
        {badge}
      </span>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">장비</h1>
        <div className="flex gap-2">
          <button onClick={() => setExcelOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            📂 엑셀 업로드
          </button>
          <button onClick={() => { setSelected(null); setModalOpen(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + 장비 등록
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="차량번호, 모델명, 업체명 검색..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { value: 'all', label: '전체' },
            { value: 'excavator', label: '굴삭기' },
            { value: 'dump', label: '🚛 덤프' },
            { value: 'truck', label: '🚚 화물차' },
          ] as const).map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                typeFilter === t.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.value === 'excavator' ? <><ExcavatorIcon size={16} /> {t.label}</> : t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">등록된 장비가 없습니다.</div>
        ) : filtered.map(e => (
          <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl flex items-center">
                  {e.type === 'excavator' ? <ExcavatorIcon size={24} /> : e.type === 'dump' ? '🚛' : '🚚'}
                </span>
                <div>
                  <div className="font-bold text-gray-900 text-base">{e.plate_no ?? '-'}</div>
                  <div className="text-sm text-gray-500">{e.spec ?? e.model ?? '-'}</div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[e.status]}`}>
                {statusLabel[e.status]}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
              <div className="text-gray-400">소속업체</div>
              <div className="text-gray-700">{(e.supplier as Supplier)?.name ?? '-'}</div>
              <div className="text-gray-400">정기검사</div>
              <div>{checkExpire(e.inspection_expire, 30)}</div>
              <div className="text-gray-400">보험만료</div>
              <div>{checkExpire(e.insurance_expire)}</div>
              {(e as any).insurance_premium && <>
                <div className="text-gray-400">보험료</div>
                <div className="text-gray-700">{(e as any).insurance_premium.toLocaleString()}원</div>
              </>}
            </div>
            <div className="mt-3 flex gap-2 pt-3 border-t border-gray-100">
              <button onClick={() => { setSelected(e); setModalOpen(true) }}
                className="flex-1 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">수정</button>
              <button onClick={() => handleShareDocs(e.id)} disabled={sharingId === e.id}
                className="flex-1 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-sm font-medium disabled:opacity-50">
                {sharingId === e.id ? '전송중...' : '📤 서류공유'}
              </button>
              <button onClick={() => handleDelete(e.id)}
                className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-500 text-sm font-medium">삭제</button>
            </div>
          </div>
        ))}
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {[
                { key: 'type', label: '종류', align: 'left' },
                { key: 'plate_no', label: '차량번호', align: 'left' },
                { key: 'spec', label: '규격', align: 'left' },
                { key: 'supplier', label: '소속업체', align: 'left' },
                { key: 'inspection_expire', label: '정기검사', align: 'left' },
                { key: 'insurance_expire', label: '보험만료', align: 'left' },
                { key: 'insurance_premium', label: '보험료', align: 'right' },
                { key: 'status', label: '상태', align: 'left' },
              ].map(col => (
                <th key={col.key}
                  className={`px-5 py-3 font-semibold text-gray-600 cursor-pointer hover:text-blue-600 select-none text-${col.align}`}
                  onClick={() => toggleSort(col.key)}>
                  {col.label}<span className="text-gray-400 text-xs">{sortIcon(col.key)}</span>
                </th>
              ))}
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">등록된 장비가 없습니다.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3">
                  {e.type === 'excavator' ? <span className="flex items-center gap-1"><ExcavatorIcon size={18} /> 굴삭기</span> : e.type === 'dump' ? '🚛 덤프' : '🚚 화물차'}
                </td>
                <td className="px-5 py-3 font-medium text-gray-900">{e.plate_no ?? '-'}</td>
                <td className="px-5 py-3 text-gray-600">{e.spec ?? e.model ?? '-'}</td>
                <td className="px-5 py-3 text-gray-600">{(e.supplier as Supplier)?.name ?? '-'}</td>
                <td className="px-5 py-3">{checkExpire(e.inspection_expire, 30)}</td>
                <td className="px-5 py-3">{checkExpire(e.insurance_expire)}</td>
                <td className="px-5 py-3 text-right text-gray-600">{(e as any).insurance_premium ? (e as any).insurance_premium.toLocaleString() + '원' : '-'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[e.status]}`}>
                    {statusLabel[e.status]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setSelected(e); setModalOpen(true) }}
                      className="text-xs text-blue-600 hover:underline">수정</button>
                    <button onClick={() => handleDelete(e.id)}
                      className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <EquipmentModal equipment={selected} suppliers={suppliers}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}
      {excelOpen && (
        <EquipmentExcelUploadModal suppliers={suppliers}
          onClose={() => setExcelOpen(false)}
          onSaved={() => { setExcelOpen(false); load() }} />
      )}
    </div>
  )
}
