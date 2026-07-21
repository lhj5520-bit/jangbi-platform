'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface VatPeriod {
  label: string   // '1기 예정'
  key: string     // '2026-1기예정'
  start: string   // '2026-01-01'
  end: string     // '2026-03-31'
  deadline: string // '2026-04-25'
}

interface VatPayment {
  id: string
  period: string
  period_start: string
  period_end: string
  sales_vat: number
  purchase_vat: number
  net_vat: number
  paid_amount?: number
  paid_at?: string
  status: string
  memo?: string
}

function getVatPeriods(year: number): VatPeriod[] {
  return [
    { label: `${year}년 1기 예정`, key: `${year}-1기예정`, start: `${year}-01-01`, end: `${year}-03-31`, deadline: `${year}-04-25` },
    { label: `${year}년 1기 확정`, key: `${year}-1기확정`, start: `${year}-04-01`, end: `${year}-06-30`, deadline: `${year}-07-25` },
    { label: `${year}년 2기 예정`, key: `${year}-2기예정`, start: `${year}-07-01`, end: `${year}-09-30`, deadline: `${year}-10-25` },
    { label: `${year}년 2기 확정`, key: `${year}-2기확정`, start: `${year}-10-01`, end: `${year}-12-31`, deadline: `${year + 1}-01-25` },
  ]
}

export default function VatPage() {
  const supabase = createClient()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [periods] = useState(() => getVatPeriods(currentYear))
  const [vatPeriods, setVatPeriods] = useState<VatPeriod[]>(getVatPeriods(currentYear))
  const [summary, setSummary] = useState<Record<string, { salesVat: number; purchaseVat: number; netVat: number }>>({})
  const [payments, setPayments] = useState<VatPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [payModal, setPayModal] = useState<VatPeriod | null>(null)
  const [payForm, setPayForm] = useState({ paid_amount: '', paid_at: '', memo: '' })
  const [saving, setSaving] = useState(false)

  async function load(ps: VatPeriod[]) {
    setLoading(true)

    // 모든 기간의 매출/매입 VAT 집계
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    const [{ data: salesData }, { data: purchaseData }, { data: payData }] = await Promise.all([
      supabase.from('invoices').select('issue_date, vat_amount').gte('issue_date', yearStart).lte('issue_date', yearEnd),
      supabase.from('purchase_invoices').select('issue_date, vat_amount').gte('issue_date', yearStart).lte('issue_date', yearEnd),
      supabase.from('vat_payments').select('*').like('period', `${year}%`).order('period_start'),
    ])

    // 기간별 집계
    const newSummary: Record<string, { salesVat: number; purchaseVat: number; netVat: number }> = {}
    for (const p of ps) {
      const salesVat = (salesData ?? [])
        .filter((r: any) => r.issue_date >= p.start && r.issue_date <= p.end)
        .reduce((a: number, r: any) => a + (r.vat_amount ?? 0), 0)
      const purchaseVat = (purchaseData ?? [])
        .filter((r: any) => r.issue_date >= p.start && r.issue_date <= p.end)
        .reduce((a: number, r: any) => a + (r.vat_amount ?? 0), 0)
      newSummary[p.key] = { salesVat, purchaseVat, netVat: salesVat - purchaseVat }
    }

    setSummary(newSummary)
    setPayments((payData ?? []) as VatPayment[])
    setLoading(false)
  }

  useEffect(() => {
    const ps = getVatPeriods(year)
    setVatPeriods(ps)
    load(ps)
  }, [year])

  async function handleSavePay(period: VatPeriod) {
    if (!payForm.paid_at) return alert('납부일을 입력해주세요.')
    setSaving(true)
    const s = summary[period.key] ?? { salesVat: 0, purchaseVat: 0, netVat: 0 }
    const existing = payments.find(p => p.period === period.key)

    const data = {
      period: period.key,
      period_start: period.start,
      period_end: period.end,
      sales_vat: s.salesVat,
      purchase_vat: s.purchaseVat,
      net_vat: s.netVat,
      paid_amount: Number(payForm.paid_amount) || s.netVat,
      paid_at: payForm.paid_at,
      status: 'paid',
      memo: payForm.memo || null,
    }

    let error
    if (existing) {
      ({ error } = await supabase.from('vat_payments').update(data).eq('id', existing.id))
    } else {
      ({ error } = await supabase.from('vat_payments').insert(data))
    }
    setSaving(false)
    if (error) { alert('저장 오류: ' + error.message); return }
    setPayModal(null)
    setPayForm({ paid_amount: '', paid_at: '', memo: '' })
    load(vatPeriods)
  }

  async function handleDeletePay(id: string) {
    if (!confirm('납부 기록을 삭제할까요?')) return
    await supabase.from('vat_payments').delete().eq('id', id)
    load(vatPeriods)
  }

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">부가세 관리</h1>
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">불러오는 중...</div>
      ) : (
        <div className="space-y-4">
          {vatPeriods.map(period => {
            const s = summary[period.key] ?? { salesVat: 0, purchaseVat: 0, netVat: 0 }
            const payment = payments.find(p => p.period === period.key)
            const isPaid = payment?.status === 'paid'
            const today = new Date().toISOString().slice(0, 10)
            const isOverdue = !isPaid && today > period.deadline

            return (
              <div key={period.key} className={`bg-white rounded-xl border-2 p-6 ${
                isPaid ? 'border-green-200' : isOverdue ? 'border-red-200' : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{period.label}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                      과세기간: {period.start} ~ {period.end} · 신고기한: {period.deadline}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPaid ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">납부완료</span>
                    ) : isOverdue ? (
                      <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">기한초과</span>
                    ) : (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-full">납부예정</span>
                    )}
                  </div>
                </div>

                {/* VAT 계산 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-xl p-4">
                    <p className="text-xs text-blue-600 mb-1 font-medium">매출세액</p>
                    <p className="text-xl font-bold text-blue-700">{s.salesVat.toLocaleString()}원</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4">
                    <p className="text-xs text-orange-600 mb-1 font-medium">매입세액 (공제)</p>
                    <p className="text-xl font-bold text-orange-700">- {s.purchaseVat.toLocaleString()}원</p>
                  </div>
                  <div className={`rounded-xl p-4 ${s.netVat >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className={`text-xs mb-1 font-medium ${s.netVat >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      납부세액 {s.netVat < 0 ? '(환급)' : ''}
                    </p>
                    <p className={`text-xl font-bold ${s.netVat >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                      {s.netVat.toLocaleString()}원
                    </p>
                  </div>
                  <div className={`rounded-xl p-4 ${isPaid ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <p className={`text-xs mb-1 font-medium ${isPaid ? 'text-green-600' : 'text-gray-500'}`}>실납부액</p>
                    <p className={`text-xl font-bold ${isPaid ? 'text-green-700' : 'text-gray-400'}`}>
                      {isPaid ? (payment.paid_amount ?? 0).toLocaleString() + '원' : '-'}
                    </p>
                  </div>
                </div>

                {/* 납부 정보 */}
                {isPaid && payment && (
                  <div className="flex items-center justify-between bg-green-50 rounded-lg px-4 py-2.5 text-sm">
                    <span className="text-green-700">
                      납부일: <strong>{payment.paid_at}</strong>
                      {payment.memo && <span className="text-green-600 ml-3">{payment.memo}</span>}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        setPayForm({ paid_amount: String(payment.paid_amount ?? ''), paid_at: payment.paid_at ?? '', memo: payment.memo ?? '' })
                        setPayModal(period)
                      }} className="text-xs text-green-600 hover:underline">수정</button>
                      <button onClick={() => handleDeletePay(payment.id)} className="text-xs text-red-500 hover:underline">삭제</button>
                    </div>
                  </div>
                )}

                {!isPaid && (
                  <button onClick={() => {
                    setPayForm({ paid_amount: String(s.netVat > 0 ? s.netVat : ''), paid_at: '', memo: '' })
                    setPayModal(period)
                  }}
                    className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    💳 납부 기록하기
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 납부 기록 모달 */}
      {payModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">납부 기록 — {payModal.label}</h2>
              <button onClick={() => setPayModal(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <label className="w-20 text-sm text-gray-500 shrink-0">납부액</label>
                <input type="number" value={payForm.paid_amount}
                  onChange={e => setPayForm(f => ({ ...f, paid_amount: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-20 text-sm text-gray-500 shrink-0">납부일 *</label>
                <input type="date" value={payForm.paid_at}
                  onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))}
                  onKeyDown={e => e.preventDefault()}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center gap-3">
                <label className="w-20 text-sm text-gray-500 shrink-0">메모</label>
                <input type="text" value={payForm.memo} placeholder="이체확인번호 등"
                  onChange={e => setPayForm(f => ({ ...f, memo: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
              <button onClick={() => setPayModal(null)}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => handleSavePay(payModal)} disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
