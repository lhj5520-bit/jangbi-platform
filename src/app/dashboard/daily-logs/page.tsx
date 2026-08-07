'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dispatch, Equipment, Supplier, Client } from '@/lib/types'
import DispatchModal from '../dispatches/DispatchModal'
import PageHeader from '@/components/PageHeader'
import LogModal from './LogModal'

export default function WorkConfirmPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [logMap, setLogMap] = useState<Record<string, string>>({})
  const [logDetailMap, setLogDetailMap] = useState<Record<string, any>>({})
  const [editLog, setEditLog] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<string>('log_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<Dispatch | null>(null)
  const [logDispatchId, setLogDispatchId] = useState<string | null>(null)
  const [newLogOpen, setNewLogOpen] = useState(false)
  const supabase = createClient()

  async function load(filter?: string) {
    setLoading(true)
    const mf = filter !== undefined ? filter : monthFilter

    let dispQuery = supabase
      .from('dispatches')
      .select('*, equipment:equipment(*, supplier:suppliers(*)), supplier:suppliers(*)')
      .order('start_date', { ascending: false })

    if (mf) {
      const [y, m] = mf.split('-')
      const from = `${y}-${m}-01`
      const lastDay = new Date(Number(y), Number(m), 0).getDate()
      const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      dispQuery = dispQuery.gte('start_date', from).lte('start_date', to)
    }

    const [{ data: disp }, { data: eq }, { data: sup }, { data: cli }, { data: logs }] = await Promise.all([
      dispQuery,
      supabase.from('equipment').select('*, supplier:suppliers(*)').order('plate_no'),
      supabase.from('suppliers').select('*').eq('status', 'active').order('name'),
      supabase.from('clients').select('*').order('name'),
      supabase.from('daily_logs').select('*').order('log_date', { ascending: false }),
    ])
    setDispatches(disp ?? [])
    setEquipment(eq ?? [])
    setSuppliers(sup ?? [])
    setClients(cli ?? [])
    const map: Record<string, string> = {}
    const detailMap: Record<string, any> = {}
    for (const log of (logs ?? [])) {
      if (log.dispatch_id && !map[log.dispatch_id]) {
        map[log.dispatch_id] = log.id
        detailMap[log.dispatch_id] = log
      }
    }
    setLogMap(map)
    setLogDetailMap(detailMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function parseSlotH(slot: string | null | undefined): number {
    if (!slot) return 0
    const m = slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
    if (!m) return 0
    const mins = (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2]))
    return Math.max(0, Math.round(mins / 60 * 10) / 10)
  }

  function hasTimeSlots(log: any) {
    return !!(log?.work_time_1 || log?.work_time_2 || log?.work_time_3 || log?.work_type_1 || log?.work_type_2 || log?.work_type_3)
  }

  function slotPrice(log: any, field: 'work_price_1' | 'work_price_2' | 'work_price_3', fallbackPrice: number) {
    return Number(log?.[field]) || fallbackPrice || 0
  }

  function getEquipLabel(d: any) {
    const emojiFor = (type: string) => type === 'excavator' ? '🚜' : type === 'dump' ? '🚛' : '🚚'
    if (d.equipment_text) {
      const parts = (d.equipment_text as string).trim().split(/\s+/)
      const plate = parts[parts.length - 1]
      const matched = equipment.find((e: any) => e.plate_no === plate)
      const display = matched ? `${emojiFor((matched as any).type)} ${d.equipment_text}` : d.equipment_text
      return display
    }
    const eq = d.equipment as any
    if (!eq) return '-'
    return `${emojiFor(eq.type)} ${eq.plate_no ?? ''}`
  }

  const filtered = dispatches.filter(d => {
    if (search) {
      const q = search.toLowerCase()
      const site = ((d as any).site_name ?? '').toLowerCase()
      const client = ((d as any).client_name ?? '').toLowerCase()
      const driver = ((d as any).driver_name ?? '').toLowerCase()
      const equip = getEquipLabel(d).toLowerCase()
      const sup = ((d.supplier as any)?.name ?? '').toLowerCase()
      if (!site.includes(q) && !client.includes(q) && !driver.includes(q) && !equip.includes(q) && !sup.includes(q)) return false
    }
    return true
  })

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  const arrow = (col: string) => sortCol === col ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ' \u2195'

  const sorted = [...filtered].sort((a, b) => {
    let av = '', bv = ''
    const logA = logDetailMap[a.id]
    const logB = logDetailMap[b.id]
    if (sortCol === 'log_date') { av = (a as any).start_date ?? logA?.log_date ?? ''; bv = (b as any).start_date ?? logB?.log_date ?? '' }
    else if (sortCol === 'site') { av = (a as any).site_name ?? ''; bv = (b as any).site_name ?? '' }
    else if (sortCol === 'equip') { av = getEquipLabel(a); bv = getEquipLabel(b) }
    else if (sortCol === 'driver') { av = (a as any).driver_name ?? ''; bv = (b as any).driver_name ?? '' }
    else if (sortCol === 'supplier') { av = (a.supplier as any)?.name ?? ''; bv = (b.supplier as any)?.name ?? '' }
    else if (sortCol === 'unit') { av = hasTimeSlots(logA) ? 'hour' : (a.unit_type ?? ''); bv = hasTimeSlots(logB) ? 'hour' : (b.unit_type ?? '') }
    else if (sortCol === 'price') {
      const pa = hasTimeSlots(logA) ? slotPrice(logA, 'work_price_1', a.client_unit_price ?? 0) : (a.client_unit_price ?? 0)
      const pb = hasTimeSlots(logB) ? slotPrice(logB, 'work_price_1', b.client_unit_price ?? 0) : (b.client_unit_price ?? 0)
      return sortDir === 'asc' ? pa - pb : pb - pa
    }
    else if (sortCol === 'amount') {
      const qa = logA?.quantity ?? 0; const qb = logB?.quantity ?? 0
      return sortDir === 'asc' ? (qa * (a.client_unit_price ?? 0)) - (qb * (b.client_unit_price ?? 0)) : (qb * (b.client_unit_price ?? 0)) - (qa * (a.client_unit_price ?? 0))
    }
    if (av === bv) return 0
    return sortDir === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko')
  })

  async function handleDelete(id: string) {
    if (!confirm('배차를 삭제하시겠습니까?')) return
    await supabase.from('daily_logs').delete().eq('dispatch_id', id)
    await supabase.from('dispatches').delete().eq('id', id)
    load()
  }

  const unitLabel: Record<string, string> = { hour: '시간', count: '횟수', day: '일' }
  const statusColor: Record<string, string> = {
    active: 'bg-blue-100 text-blue-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }

  const totalAmount = sorted.reduce((sum, d) => {
    const log = logDetailMap[d.id]
    if (!log) return sum
    const fallbackPrice = (d as any).client_unit_price ?? 0
    // 시간대 작업명 있으면 시간×단가 합산 (개별단가 없으면 청구단가 사용)
    if (hasTimeSlots(log)) {
      let amt = 0
      if (log.work_type_1 && log.work_time_1) { const h = parseSlotH(log.work_time_1); const p = Number(log.work_price_1) || fallbackPrice; amt += h && p ? Math.round(h * p) : 0 }
      if (log.work_type_2 && log.work_time_2) { const h = parseSlotH(log.work_time_2); const p = Number(log.work_price_2) || fallbackPrice; amt += h && p ? Math.round(h * p) : 0 }
      if ((log as any).work_type_3 && (log as any).work_time_3) { const h = parseSlotH((log as any).work_time_3); const p = Number((log as any).work_price_3) || fallbackPrice; amt += h && p ? Math.round(h * p) : 0 }
      return sum + amt
    }
    // 수량 × 청구단가
    const qty = log.quantity; const price = (d as any).client_unit_price
    return sum + (qty && price ? Math.round(qty * price) : 0)
  }, 0)

  const tableRows = sorted.flatMap(d => {
    const sup = d.supplier as Supplier
    const log = logDetailMap[d.id]
    const dateTd = (d as any).start_date ?? log?.log_date
    const siteTd = (d as any).site_name ?? '-'
    const equipTd = getEquipLabel(d)
    const driverTd = (d as any).driver_name ?? '-'
    const supTd = sup?.name ?? (d as any).supplier_text ?? '-'
    const actionsTd = (
      <div className="flex gap-2 justify-end">
        <button onClick={() => logMap[d.id] ? window.open('/sign/' + logMap[d.id], '_blank') : setLogDispatchId(d.id)}
          className={`text-xs font-medium ${logMap[d.id] ? 'text-green-700' : 'text-gray-400'} hover:underline`}>
          {logMap[d.id] ? '📄 작업확인서' : '일보작성'}</button>
        <button onClick={() => { setEditLog(log ?? { dispatch_id: d.id }); setLogDispatchId(d.id) }}
          className="text-xs text-blue-600 hover:underline">수정</button>
        <button onClick={() => handleDelete(d.id)}
          className="text-xs text-red-500 hover:underline">삭제</button>
      </div>
    )
    if (log && hasTimeSlots(log)) {
      const rows = []
      const fallbackPrice = Number((d as any).client_unit_price) || 0
      if (log.work_time_1 || log.work_type_1) {
        const h = parseSlotH(log.work_time_1)
        const p = slotPrice(log, 'work_price_1', fallbackPrice)
        rows.push(<tr key={d.id + '_w1'} className="hover:bg-gray-50 transition-colors">
          <td className="px-4 py-3 text-gray-500 text-xs">{dateTd}</td>
          <td className="px-4 py-3 font-medium text-gray-900">{siteTd}</td>
          <td className="px-4 py-3 text-gray-600">{equipTd}</td>
          <td className="px-4 py-3 text-gray-600">{driverTd}</td>
          <td className="px-4 py-3 text-gray-600">{supTd}</td>
          <td className="px-4 py-3 text-gray-500"><span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{log.work_type_1 || '시간'}</span></td>
          <td className="px-4 py-3 text-right text-gray-500">{h ? `${h}h` : '-'}</td>
          <td className="px-4 py-3 text-right text-gray-900">{p ? p.toLocaleString() + '원' : '-'}</td>
          <td className="px-4 py-3 text-right text-blue-700 font-medium">{h && p ? Math.round(h * p).toLocaleString() + '원' : '-'}</td>
          <td className="px-4 py-3">{actionsTd}</td>
        </tr>)
      }
      if (log.work_time_2 || log.work_type_2) {
        const h = parseSlotH(log.work_time_2)
        const p = slotPrice(log, 'work_price_2', fallbackPrice)
        rows.push(<tr key={d.id + '_w2'} className="hover:bg-purple-50 transition-colors">
          <td className="px-4 py-3 text-gray-500 text-xs">{dateTd}</td>
          <td className="px-4 py-3 font-medium text-gray-900">{siteTd}</td>
          <td className="px-4 py-3 text-gray-600">{equipTd}</td>
          <td className="px-4 py-3 text-gray-600">{driverTd}</td>
          <td className="px-4 py-3 text-gray-600">{supTd}</td>
          <td className="px-4 py-3 text-gray-500"><span className="text-xs font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">{log.work_type_2 || '시간'}</span></td>
          <td className="px-4 py-3 text-right text-gray-500">{h ? `${h}h` : '-'}</td>
          <td className="px-4 py-3 text-right text-gray-900">{p ? p.toLocaleString() + '원' : '-'}</td>
          <td className="px-4 py-3 text-right text-blue-700 font-medium">{h && p ? Math.round(h * p).toLocaleString() + '원' : '-'}</td>
          <td className="px-4 py-3"></td>
        </tr>)
      }
      if ((log as any).work_time_3 || (log as any).work_type_3) {
        const h = parseSlotH((log as any).work_time_3)
        const p = slotPrice(log, 'work_price_3', fallbackPrice)
        rows.push(<tr key={d.id + '_w3'} className="hover:bg-orange-50 transition-colors">
          <td className="px-4 py-3 text-gray-500 text-xs">{dateTd}</td>
          <td className="px-4 py-3 font-medium text-gray-900">{siteTd}</td>
          <td className="px-4 py-3 text-gray-600">{equipTd}</td>
          <td className="px-4 py-3 text-gray-600">{driverTd}</td>
          <td className="px-4 py-3 text-gray-600">{supTd}</td>
          <td className="px-4 py-3 text-gray-500"><span className="text-xs font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">{(log as any).work_type_3 || '시간'}</span></td>
          <td className="px-4 py-3 text-right text-gray-500">{h ? `${h}h` : '-'}</td>
          <td className="px-4 py-3 text-right text-gray-900">{p ? p.toLocaleString() + '원' : '-'}</td>
          <td className="px-4 py-3 text-right text-blue-700 font-medium">{h && p ? Math.round(h * p).toLocaleString() + '원' : '-'}</td>
          <td className="px-4 py-3"></td>
        </tr>)
      }
      if (rows.length > 0) return rows
    }
    const qty = log?.quantity
    const price = d.client_unit_price
    const displayAmt = qty && price ? Math.round(qty * price) : 0
    return [<tr key={d.id} className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-gray-500 text-xs">{dateTd}</td>
      <td className="px-4 py-3 font-medium text-gray-900">{siteTd}</td>
      <td className="px-4 py-3 text-gray-600">{equipTd}</td>
      <td className="px-4 py-3 text-gray-600">{driverTd}</td>
      <td className="px-4 py-3 text-gray-600">{supTd}</td>
      <td className="px-4 py-3 text-gray-500">{unitLabel[d.unit_type] ?? '-'}</td>
      <td className="px-4 py-3 text-right text-gray-500">{qty ? `${qty}h` : '-'}</td>
      <td className="px-4 py-3 text-right text-gray-900">{price ? price.toLocaleString() + '원' : '-'}</td>
      <td className="px-4 py-3 text-right text-blue-700 font-medium">{displayAmt ? displayAmt.toLocaleString() + '원' : '-'}</td>
      <td className="px-4 py-3">{actionsTd}</td>
    </tr>]
  })

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="작업확인서"
        primary={{ label: '+ 배차 등록', onClick: () => setNewLogOpen(true) }}
        secondary={[{ label: '새로고침', onClick: () => load() }]}
      />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">금액 합계</div>
          <div className="text-lg font-bold text-blue-700">{totalAmount.toLocaleString()}원</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">건수</div>
          <div className="text-lg font-bold text-gray-800">{sorted.length}건</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="month"
          value={monthFilter}
          onChange={e => { setMonthFilter(e.target.value); load(e.target.value) }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => { setMonthFilter(''); load('') }} className="px-3 py-2 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50">
          전체
        </button>
        <input
          type="text"
          placeholder="현장명, 발주처, 차주, 현장업체 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="touch-list md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">배차 내역이 없습니다.</div>
        ) : filtered.map(d => {
          const sup = d.supplier as Supplier
          return (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold text-gray-900">{(d as any).site_name ?? '-'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{getEquipLabel(d)}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ml-2 ${statusColor[d.status]}`}>
                  {d.status === 'active' ? '배차중' : d.status === 'completed' ? '완료' : '취소'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm mt-2">
                <div className="text-gray-400">차주</div>
                <div className="text-gray-700">{(d as any).driver_name ?? '-'}</div>
                <div className="text-gray-400">중기업체</div>
                <div className="text-gray-700">{sup?.name ?? (d as any).supplier_text ?? '-'}</div>
                <div className="text-gray-400">날짜</div>
                <div className="text-gray-700 text-xs">{(d as any).start_date}</div>
              </div>
              {/* 주요 행동(확인서 출력 / 일보 작성)을 한 줄 전체로, 부수 행동은 아래 줄로 분리 */}
              <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
                {logMap[d.id] ? (
                  <button onClick={() => window.open('/sign/' + logMap[d.id], '_blank')}
                    className="w-full rounded-lg bg-green-600 py-3 text-sm font-bold text-white">작업확인서 열기</button>
                ) : (
                  <button onClick={() => setLogDispatchId(d.id)}
                    className="w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white">일보 작성</button>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setEditLog(logDetailMap[d.id] ?? { dispatch_id: d.id }); setLogDispatchId(d.id) }}
                    className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600">수정</button>
                  <button onClick={() => handleDelete(d.id)}
                    className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-500">삭제</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {(() => {
              const thL = 'text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap'
              const thR = 'text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap'
              return (
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className={thL} onClick={() => handleSort('log_date')}>날짜{arrow('log_date')}</th>
                  <th className={thL} onClick={() => handleSort('site')}>현장{arrow('site')}</th>
                  <th className={thL} onClick={() => handleSort('equip')}>장비{arrow('equip')}</th>
                  <th className={thL} onClick={() => handleSort('driver')}>차주{arrow('driver')}</th>
                  <th className={thL} onClick={() => handleSort('supplier')}>중기업체{arrow('supplier')}</th>
                  <th className={thL} onClick={() => handleSort('unit')}>단위{arrow('unit')}</th>
                  <th className={thR}>가동시간</th>
                  <th className={thR} onClick={() => handleSort('price')}>단가{arrow('price')}</th>
                  <th className={thR} onClick={() => handleSort('amount')}>금액{arrow('amount')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              )
            })()}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">배차 내역이 없습니다.</td></tr>
) : tableRows}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <DispatchModal dispatch={selected} equipment={equipment} suppliers={suppliers}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}

      {logDispatchId && (
        <LogModal
          log={editLog ?? { dispatch_id: logDispatchId } as any}
          dispatches={dispatches as any}
          equipment={equipment as any}
          suppliers={suppliers}
          clients={clients}
          onClose={() => { setLogDispatchId(null); setEditLog(null) }}
          onSaved={() => { setLogDispatchId(null); setEditLog(null); load() }}
        />
      )}

      {newLogOpen && (
        <LogModal
          log={null}
          dispatches={[]}
          equipment={equipment as any}
          suppliers={suppliers}
          clients={clients}
          onClose={() => setNewLogOpen(false)}
          onSaved={() => { setNewLogOpen(false); load() }}
        />
      )}
    </div>
  )
}
