'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dispatch, Equipment, Supplier, Client } from '@/lib/types'
import LogModal from '../daily-logs/LogModal'
import PageHeader from '@/components/PageHeader'

export default function DispatchesPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'all' | 'today' | 'nolog'>('all')
  const [logForModal, setLogForModal] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [loggedIds, setLoggedIds] = useState<Set<string>>(new Set())
  const [logDetailMap, setLogDetailMap] = useState<Record<string, any>>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  async function load() {
    const [{ data: disp }, { data: eq }, { data: sup }, { data: logs }, { data: cli }] = await Promise.all([
      supabase.from('dispatches').select('*, equipment:equipment(*, supplier:suppliers(*)), supplier:suppliers(*)').order('start_date', { ascending: false }),
      supabase.from('equipment').select('*, supplier:suppliers(*)').order('plate_no'),
      supabase.from('suppliers').select('*').eq('status', 'active').order('name'),
      supabase.from('daily_logs').select('dispatch_id, log_date, quantity, work_time_1, work_time_2, work_time_3, work_type_1, work_type_2, work_type_3, work_price_1, work_price_2, work_price_3').order('log_date', { ascending: false }),
      supabase.from('clients').select('*').order('name'),
    ])
    setDispatches(disp ?? [])
    setEquipment(eq ?? [])
    setSuppliers(sup ?? [])
    setClients(cli ?? [])
    const detailMap: Record<string, any> = {}
    for (const log of (logs ?? [])) {
      if (log.dispatch_id && !detailMap[log.dispatch_id]) detailMap[log.dispatch_id] = log
    }
    setLoggedIds(new Set(Object.keys(detailMap)))
    setLogDetailMap(detailMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function openLogModal(dispatchId: string) {
    const { data } = await supabase.from('daily_logs')
      .select('*').eq('dispatch_id', dispatchId)
      .order('log_date', { ascending: false }).limit(1)
    setLogForModal(data?.[0] ?? { dispatch_id: dispatchId })
  }

  async function handleDelete(id: string) {
    if (!confirm('배차를 삭제하시겠습니까?')) return
    await supabase.from('dispatches').delete().eq('id', id)
    load()
  }

  async function handleBulkComplete() {
    if (selectedIds.size === 0) return
    await Promise.all([...selectedIds].map(id =>
      supabase.from('dispatches').update({ status: 'completed' }).eq('id', id)
    ))
    setSelectedIds(new Set())
    load()
  }

  function toggleSelect(id: string) {
    setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(d => d.id)))
  }

  function getEquipLabel(d: any) {
    const emojiFor = (type: string) => type === 'excavator' ? '🚜' : type === 'dump' ? '🚛' : '🚚'
    if (d.equipment_text) {
      const matched = equipment.find(e => e.plate_no === d.equipment_text)
      return matched ? `${emojiFor(matched.type)} ${d.equipment_text}` : d.equipment_text
    }
    const eq = d.equipment as Equipment
    if (!eq) return '-'
    return `${emojiFor(eq.type)} ${eq.plate_no ?? ''}`
  }

  const unitLabel: Record<string, string> = { hour: '시간', count: '횟수', day: '일' }
  function hasTimeSlots(log: any) {
    return !!(log?.work_time_1 || log?.work_time_2 || log?.work_time_3 || log?.work_type_1 || log?.work_type_2 || log?.work_type_3)
  }
  function displayUnit(d: Dispatch) {
    return hasTimeSlots(logDetailMap[d.id]) ? 'hour' : d.unit_type
  }
  function displayPrice(d: Dispatch) {
    const log = logDetailMap[d.id]
    if (hasTimeSlots(log)) {
      return Number(log?.work_price_1) || Number(log?.work_price_2) || Number(log?.work_price_3) || Number(d.client_unit_price) || 0
    }
    return Number(d.client_unit_price) || 0
  }
  const [sortCol, setSortCol] = useState<string>('start_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 오늘 배차 / 일보 미작성 배차가 실제로 손이 가는 대상이라 바로 걸러볼 수 있게 한다.
  const todayCount = dispatches.filter(d => d.start_date === today).length
  const noLogCount = dispatches.filter(d => !loggedIds.has(d.id)).length
  const filtered = dispatches.filter(d =>
    view === 'today' ? d.start_date === today
    : view === 'nolog' ? !loggedIds.has(d.id)
    : true
  )

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const arrow = (col: string) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'
  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any
    if (sortCol === 'start_date') { av = (a as any).start_date ?? ''; bv = (b as any).start_date ?? '' }
    else if (sortCol === 'equip') { av = getEquipLabel(a); bv = getEquipLabel(b) }
    else if (sortCol === 'driver') { av = (a as any).driver_name ?? ''; bv = (b as any).driver_name ?? '' }
    else if (sortCol === 'site') { av = (a as any).site_name ?? ''; bv = (b as any).site_name ?? '' }
    else if (sortCol === 'unit') { av = displayUnit(a) ?? ''; bv = displayUnit(b) ?? '' }
    else if (sortCol === 'price') { av = displayPrice(a); bv = displayPrice(b) }
    else if (sortCol === 'status') { av = (a as any).status ?? ''; bv = (b as any).status ?? '' }
    else { av = ''; bv = '' }
    if (av === bv) return 0
    return (av < bv ? -1 : 1) * (sortDir === 'asc' ? 1 : -1)
  })
  const statusColor: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="배차 등록"
        primary={{ label: '+ 배차 등록', onClick: () => setLogForModal({ dispatch_id: null }) }}
      >
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {([
            { key: 'all',   label: `전체 ${dispatches.length}` },
            { key: 'today', label: `오늘 ${todayCount}` },
            { key: 'nolog', label: `일보없음 ${noLogCount}` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setView(t.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                view === t.key
                  ? 'bg-gray-900 text-white'
                  : t.key === 'nolog' && noLogCount > 0
                    ? 'border border-red-200 bg-red-50 text-red-600'
                    : 'border border-gray-300 bg-white text-gray-600'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {selectedIds.size > 0 && (
        <div className="mb-4">
          <button onClick={handleBulkComplete}
            className="rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900">
            선택 {selectedIds.size}건 완료처리
          </button>
        </div>
      )}

      {/* 모바일 카드 */}
      <div className="touch-list md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">배차 내역이 없습니다.</div>
        ) : sorted.map(d => {
          const isToday = d.start_date === today
          return (
            <div key={d.id} className={`rounded-xl border p-4 ${isToday ? 'border-yellow-400 bg-yellow-50' : !loggedIds.has(d.id) ? 'border-red-300 bg-red-50/30' : 'bg-white border-gray-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} className="w-4 h-4 accent-blue-600" />
                  <div>
                    <div className="font-bold text-gray-900">{(d as any).site_name ?? '-'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{getEquipLabel(d)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {isToday && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-400 text-yellow-900">오늘</span>}
                  {(d as any).status === 'completed' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">완료</span>}
                  {!loggedIds.has(d.id) && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">⚠ 일보없음</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm mt-2">
                <div className="text-gray-400">날짜</div>
                <div className="text-gray-700 text-xs">{d.start_date ?? '-'}{isToday && <span className="ml-1 text-yellow-600 font-semibold">오늘</span>}</div>
                <div className="text-gray-400">차주</div>
                <div className="text-gray-700">{(d as any).driver_name ?? '-'}</div>
                <div className="text-gray-400">단위</div>
                <div className="text-gray-700">{unitLabel[displayUnit(d)] ?? '-'}</div>
                {displayPrice(d) ? <>
                  <div className="text-gray-400">시간단가</div>
                  <div className="text-gray-700">{displayPrice(d).toLocaleString()}원</div>
                </> : null}
              </div>
              <div className="mt-3 flex gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => openLogModal(d.id)}
                  className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white">수정</button>
                <button onClick={() => handleDelete(d.id)}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-500">삭제</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3">
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} className="w-4 h-4 accent-blue-600 cursor-pointer" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('start_date')}>날짜{arrow('start_date')}</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('equip')}>장비{arrow('equip')}</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('driver')}>차주{arrow('driver')}</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('site')}>현장{arrow('site')}</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('unit')}>단위{arrow('unit')}</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('price')}>시간단가{arrow('price')}</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('status')}>상태{arrow('status')}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-gray-400">배차 내역이 없습니다.</td></tr>
            ) : sorted.map(d => {
              const isToday = d.start_date === today
              return (
                <tr key={d.id} className={`transition-colors ${isToday ? 'bg-yellow-50 hover:bg-yellow-100' : !loggedIds.has(d.id) ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {!loggedIds.has(d.id) && <span className="mr-1 text-xs text-red-500 font-semibold">⚠</span>}
                    {d.start_date ?? '-'}
                    {isToday && <span className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-400 text-yellow-900">오늘</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{getEquipLabel(d)}</td>
                  <td className="px-4 py-3 text-gray-600">{(d as any).driver_name ?? '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{(d as any).site_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{unitLabel[displayUnit(d)] ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {displayPrice(d) ? displayPrice(d).toLocaleString() + '원' : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[(d as any).status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {(d as any).status === 'active' ? '진행중' : (d as any).status === 'completed' ? '완료' : (d as any).status ?? '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openLogModal(d.id)}
                        className="text-xs text-blue-600 hover:underline font-medium">수정</button>
                      <button onClick={() => handleDelete(d.id)}
                        className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {logForModal && (
        <LogModal
          log={logForModal}
          dispatches={dispatches as any}
          equipment={equipment as any}
          suppliers={suppliers}
          clients={clients}
          onClose={() => setLogForModal(null)}
          onSaved={() => { setLogForModal(null); load() }}
        />
      )}
    </div>
  )
}
