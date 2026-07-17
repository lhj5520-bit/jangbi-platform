'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const CATEGORIES = ['주유비', '급여', '수리·정비비', '보험료', '정기검사비', '소모품', '지입료', '기타']
const TYPE_LABEL: Record<string, string> = { excavator: '굴삭기', dump: '덤프', truck: '화물', cargo: '화물' }

interface EquipRow { id: string; plate_no: string | null; type: string | null }
interface CostRow { id: string; equipment_id: string; cost_date: string; category: string; amount: number; memo: string | null; receipt_url: string | null }

function parseH(slot: string | null): number {
  if (!slot) return 0
  const m = slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
  if (!m) return 0
  return Math.max(0, (Number(m[3]) * 60 + Number(m[4]) - Number(m[1]) * 60 - Number(m[2])) / 60)
}

const fmt = (n: number) => Math.round(n).toLocaleString()
const todayStr = () => new Date(new Date().getTime() + 9 * 3600000).toISOString().slice(0, 10)

export default function EquipmentCostsPage() {
  const supabase = createClient()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState<number>(() => new Date().getMonth() + 1) // 0 = 연간
  const [equipFilter, setEquipFilter] = useState('')
  const [equipment, setEquipment] = useState<EquipRow[]>([])
  const [costs, setCosts] = useState<CostRow[]>([])
  const [revenueByEquip, setRevenueByEquip] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ cost_date: todayStr(), equipment_id: '', category: '주유비', amount: '', memo: '' })

  const periodStart = month ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`
  const periodEnd = month
    ? `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
    : `${year}-12-31`

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: eqData }, { data: costData, error: costErr }, { data: dispData }] = await Promise.all([
        supabase.from('equipment').select('id, plate_no, type').eq('ownership', 'own').order('plate_no'),
        supabase.from('equipment_costs').select('*').gte('cost_date', periodStart).lte('cost_date', periodEnd).order('cost_date', { ascending: false }),
        supabase.from('dispatches')
          .select('equipment_id, client_unit_price, equipment:equipment(plate_no), equipment_text, daily_logs(quantity,work_price_1,work_price_2,work_price_3,work_time_1,work_time_2,work_time_3)')
          .gte('start_date', periodStart)
          .lte('start_date', periodEnd),
      ])
      if (cancelled) return
      if (costErr) {
        alert('투입비용 테이블을 불러올 수 없습니다. Supabase에 equipment_costs 테이블이 생성되었는지 확인해주세요.\n' + costErr.message)
      }
      const eqList: EquipRow[] = (eqData ?? []) as EquipRow[]
      setEquipment(eqList)
      setCosts((costData ?? []) as CostRow[])
      setForm(f => f.equipment_id ? f : { ...f, equipment_id: eqList[0]?.id ?? '' })

      // 장비별 배차 매출 (equipment_id 또는 차량번호 텍스트 매칭)
      const rev: Record<string, number> = {}
      for (const eq of eqList) rev[eq.id] = 0
      for (const d of (dispData ?? []) as any[]) {
        const log = (d.daily_logs as any[] | null)?.[0]
        if (!log) continue
        const plateNo = (d.equipment as any)?.plate_no ?? ''
        const eqText = (d.equipment_text as string) ?? ''
        const target = eqList.find(eq =>
          (d.equipment_id && d.equipment_id === eq.id) ||
          (eq.plate_no && (plateNo.includes(eq.plate_no) || eqText.replace(/\s/g, '').includes(eq.plate_no.replace(/\s/g, ''))))
        )
        if (!target) continue
        const qty = log.quantity ?? 0
        const p1 = Number(log.work_price_1) || 0, p2 = Number(log.work_price_2) || 0, p3 = Number(log.work_price_3) || 0
        const slotAmt =
          (log.work_time_1 ? Math.round(parseH(log.work_time_1) * p1) : 0) +
          (log.work_time_2 ? Math.round(parseH(log.work_time_2) * p2) : 0) +
          (log.work_time_3 ? Math.round(parseH(log.work_time_3) * p3) : 0)
        rev[target.id] += slotAmt || Math.round(qty * (d.client_unit_price ?? 0))
      }
      setRevenueByEquip(rev)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [year, month])

  async function handleSave() {
    if (!form.equipment_id) return alert('장비를 선택해주세요.')
    const amount = Number(form.amount.replace(/[^\d]/g, ''))
    if (!amount) return alert('금액을 입력해주세요.')
    if (!form.cost_date) return alert('날짜를 입력해주세요.')
    setSaving(true)
    const { data: inserted, error } = await supabase.from('equipment_costs').insert({
      equipment_id: form.equipment_id,
      cost_date: form.cost_date,
      category: form.category,
      amount,
      memo: form.memo || null,
    }).select().single()
    setSaving(false)
    if (error) { alert('저장 실패: ' + error.message); return }
    if (inserted && form.cost_date >= periodStart && form.cost_date <= periodEnd) {
      setCosts(prev => [inserted as CostRow, ...prev])
    }
    setForm(f => ({ ...f, amount: '', memo: '' }))
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    const { error } = await supabase.from('equipment_costs').delete().eq('id', id)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setCosts(prev => prev.filter(c => c.id !== id))
  }

  const visibleEquip = equipFilter ? equipment.filter(e => e.id === equipFilter) : equipment
  const visibleCosts = equipFilter ? costs.filter(c => c.equipment_id === equipFilter) : costs
  const costByEquip: Record<string, number> = {}
  for (const c of costs) costByEquip[c.equipment_id] = (costByEquip[c.equipment_id] ?? 0) + (c.amount ?? 0)
  const totalRevenue = visibleEquip.reduce((s, e) => s + (revenueByEquip[e.id] ?? 0), 0)
  const totalCost = visibleCosts.reduce((s, c) => s + (c.amount ?? 0), 0)
  const profit = totalRevenue - totalCost
  const plateOf = (id: string) => {
    const eq = equipment.find(e => e.id === id)
    return eq ? `${eq.plate_no ?? '번호없음'}` : '-'
  }

  const inp = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">장비별 투입비용 (자차)</h1>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className={inp}>
          {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} className={inp}>
          <option value={0}>연간</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
        </select>
        <select value={equipFilter} onChange={e => setEquipFilter(e.target.value)} className={inp + ' min-w-[160px]'}>
          <option value="">전체 장비</option>
          {equipment.map(e => (
            <option key={e.id} value={e.id}>{e.plate_no ?? '번호없음'} · {TYPE_LABEL[e.type ?? ''] ?? e.type ?? ''}</option>
          ))}
        </select>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">배차 매출</p>
          <p className="text-xl font-bold text-gray-900">{loading ? '-' : fmt(totalRevenue) + '원'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">투입비용</p>
          <p className="text-xl font-bold text-red-600">{loading ? '-' : fmt(totalCost) + '원'}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-1">순이익 · 이익률</p>
          <p className="text-xl font-bold text-emerald-600">
            {loading ? '-' : `${fmt(profit)}원`}
            {!loading && totalRevenue > 0 && <span className="ml-2 text-xs font-medium text-gray-500">{(profit / totalRevenue * 100).toFixed(1)}%</span>}
          </p>
        </div>
      </div>

      {/* 장비별 손익 표 */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">장비</th>
              <th className="px-4 py-2.5 text-right font-medium">매출</th>
              <th className="px-4 py-2.5 text-right font-medium">비용</th>
              <th className="px-4 py-2.5 text-right font-medium">순이익</th>
              <th className="px-4 py-2.5 text-right font-medium">이익률</th>
            </tr>
          </thead>
          <tbody>
            {visibleEquip.map(eq => {
              const rev = revenueByEquip[eq.id] ?? 0
              const cost = costByEquip[eq.id] ?? 0
              const p = rev - cost
              return (
                <tr key={eq.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {eq.plate_no ?? '번호없음'} <span className="text-xs text-gray-400">{TYPE_LABEL[eq.type ?? ''] ?? eq.type ?? ''}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{fmt(rev)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{fmt(cost)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">{fmt(p)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500">{rev > 0 ? (p / rev * 100).toFixed(0) + '%' : '-'}</td>
                </tr>
              )
            })}
            {!loading && visibleEquip.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">자차 장비가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 비용 입력 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-2">
        <p className="text-sm font-semibold text-gray-700">비용 입력</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input type="date" value={form.cost_date} onChange={e => setForm(f => ({ ...f, cost_date: e.target.value }))} className={inp} />
          <select value={form.equipment_id} onChange={e => setForm(f => ({ ...f, equipment_id: e.target.value }))} className={inp}>
            {equipment.map(e => <option key={e.id} value={e.id}>{e.plate_no ?? '번호없음'}</option>)}
          </select>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <input value={form.amount} inputMode="numeric" placeholder="금액 (원)"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            className={inp + ' text-right'} />
        </div>
        <div className="flex gap-2">
          <input value={form.memo} placeholder="거래처·메모 (선택)"
            onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
            className={inp + ' flex-1'} />
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* 비용 내역 */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">날짜</th>
              <th className="px-4 py-2.5 text-left font-medium">장비</th>
              <th className="px-4 py-2.5 text-left font-medium">항목</th>
              <th className="px-4 py-2.5 text-right font-medium">금액</th>
              <th className="px-4 py-2.5 text-left font-medium">메모</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {visibleCosts.map(c => (
              <tr key={c.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">{c.cost_date}</td>
                <td className="px-4 py-2 whitespace-nowrap font-medium">{plateOf(c.equipment_id)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{c.category}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{fmt(c.amount ?? 0)}원</td>
                <td className="px-4 py-2 text-gray-500">{c.memo ?? ''}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                </td>
              </tr>
            ))}
            {!loading && visibleCosts.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">등록된 비용이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
