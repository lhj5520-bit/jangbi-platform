'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settlement, Supplier } from '@/lib/types'
import SettlementModal from './SettlementModal'

interface SettlementWithSupplier extends Settlement {
  supplier: Supplier
}

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementWithSupplier[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<SettlementWithSupplier | null>(null)
  const supabase = createClient()

  async function load() {
    const [{ data: setData }, { data: supData }] = await Promise.all([
      supabase.from('settlements')
        .select('*, supplier:suppliers(*)')
        .gte('period_start', month + '-01')
        .lte('period_end', month + '-31')
        .order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('status', 'active').order('name'),
    ])
    setSettlements((setData ?? []) as SettlementWithSupplier[])
    setSuppliers(supData ?? [])
    setLoading(false)
  }

  async function handleAutoSettle() {
    if (!confirm(`${month} 월 일보 기준으로 중기업체별 정산을 자동 생성할까요?`)) return

    const startDate = month + '-01'
    const endDate = month + '-31'

    const { data: logs } = await supabase
      .from('daily_logs')
      .select('*, dispatch:dispatches(*, supplier:suppliers(*))')
      .gte('log_date', startDate)
      .lte('log_date', endDate)

    if (!logs || logs.length === 0) return alert('해당 월 일보 데이터가 없습니다.')

    const bySupplier: Record<string, { supplierId: string; gross: number; commission: number; net: number }> = {}
    for (const log of logs) {
      const d = log.dispatch as any
      const supplierId = d?.supplier_id
      if (!supplierId) continue
      const supplierPrice = d?.supplier_unit_price ?? 0
      const clientPrice = d?.client_unit_price ?? 0
      const commission = (clientPrice - supplierPrice) * log.quantity

      if (!bySupplier[supplierId]) {
        bySupplier[supplierId] = { supplierId, gross: 0, commission: 0, net: 0 }
      }
      bySupplier[supplierId].gross += clientPrice * log.quantity
      bySupplier[supplierId].commission += commission
      bySupplier[supplierId].net += supplierPrice * log.quantity
    }

    await supabase.from('settlements')
      .delete()
      .gte('period_start', startDate)
      .lte('period_end', endDate)

    const rows = Object.values(bySupplier).map(s => ({
      supplier_id: s.supplierId,
      period_start: startDate,
      period_end: endDate,
      gross_amount: s.gross,
      commission_amount: s.commission,
      net_amount: s.net,
      status: 'pending',
    }))

    if (rows.length > 0) await supabase.from('settlements').insert(rows)
    load()
  }

  async function handleMarkPaid(id: string) {
    await supabase.from('settlements').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('settlements').delete().eq('id', id)
    load()
  }

  useEffect(() => { load() }, [month])

  const filtered = settlements.filter(s => statusFilter === 'all' || s.status === statusFilter)
  const totalGross = filtered.reduce((a, s) => a + (s.gross_amount ?? 0), 0)
  const totalCommission = filtered.reduce((a, s) => a + (s.commission_amount ?? 0), 0)
  const totalNet = filtered.reduce((a, s) => a + (s.net_amount ?? 0), 0)

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">정산</h1>
        <div className="flex gap-2">
          <button onClick={handleAutoSettle}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            ⚡ 자동 집계
          </button>
          <button onClick={() => { setSelected(null); setModalOpen(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            + 등록
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'pending', 'paid'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s === 'all' ? '전체' : s === 'pending' ? '미지급' : '지급완료'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">총 청구금액</p>
            <p className="text-base font-bold text-gray-900">{totalGross.toLocaleString()}원</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">총 지급금액</p>
            <p className="text-base font-bold text-gray-900">{totalNet.toLocaleString()}원</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-xs text-green-700 mb-1">수익</p>
            <p className="text-base font-bold text-green-700">{totalCommission.toLocaleString()}원</p>
          </div>
        </div>
      )}

      {/* 모바일 카드 */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">정산 내역이 없습니다. ⚡ 자동 집계를 눌러보세요.</div>
        ) : filtered.map(s => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-bold text-gray-900">{s.supplier?.name ?? '-'}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.period_start} ~ {s.period_end}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {s.status === 'paid' ? '지급완료' : '미지급'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 rounded-lg p-2 mb-3">
              <div><div className="text-xs text-gray-400">청구</div><div className="text-sm font-medium">{s.gross_amount?.toLocaleString()}</div></div>
              <div><div className="text-xs text-gray-400">수수료</div><div className="text-sm font-medium text-orange-600">{s.commission_amount?.toLocaleString()}</div></div>
              <div><div className="text-xs text-gray-400">지급</div><div className="text-sm font-bold">{s.net_amount?.toLocaleString()}</div></div>
            </div>
            {s.paid_at && <div className="text-xs text-gray-400 mb-2">지급일: {new Date(s.paid_at).toLocaleDateString('ko-KR')}</div>}
            <div className="flex gap-2">
              {s.status === 'pending' && (
                <button onClick={() => handleMarkPaid(s.id)}
                  className="flex-1 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium">지급완료</button>
              )}
              <button onClick={() => { setSelected(s); setModalOpen(true) }}
                className="flex-1 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">수정</button>
              <button onClick={() => handleDelete(s.id)}
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
              <th className="text-left px-5 py-3 font-semibold text-gray-600">중기업체</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">정산기간</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">청구금액</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">수수료</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">지급금액</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">상태</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">지급일</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">
                정산 내역이 없습니다. ⚡ 자동 집계를 눌러보세요.
              </td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{s.supplier?.name ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{s.period_start} ~ {s.period_end}</td>
                <td className="px-5 py-3 text-right text-gray-900">{s.gross_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3 text-right text-orange-600 font-medium">{s.commission_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{s.net_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {s.status === 'paid' ? '지급완료' : '미지급'}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {s.paid_at ? new Date(s.paid_at).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-2 justify-end">
                    {s.status === 'pending' && (
                      <button onClick={() => handleMarkPaid(s.id)}
                        className="text-xs text-green-600 hover:underline">지급완료</button>
                    )}
                    <button onClick={() => { setSelected(s); setModalOpen(true) }}
                      className="text-xs text-blue-600 hover:underline">수정</button>
                    <button onClick={() => handleDelete(s.id)}
                      className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <SettlementModal settlement={selected} suppliers={suppliers} month={month}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}
    </div>
  )
}
