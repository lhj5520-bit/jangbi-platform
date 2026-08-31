'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Settlement, Supplier } from '@/lib/types'

interface Props {
  settlement: Settlement | null
  suppliers: Supplier[]
  month: string
  onClose: () => void
  onSaved: () => void
}

export default function SettlementModal({ settlement, suppliers, month, onClose, onSaved }: Props) {
  const isEdit = !!settlement
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])
  const [form, setForm] = useState({
    supplier_id: settlement?.supplier_id ?? '',
    period_start: settlement?.period_start ?? month + '-01',
    period_end: settlement?.period_end ?? month + '-31',
    gross_amount: settlement?.gross_amount ?? '',
    commission_amount: settlement?.commission_amount ?? '',
    net_amount: settlement?.net_amount ?? '',
    status: settlement?.status ?? 'pending',
    memo: settlement?.memo ?? '',
  })

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleGrossChange(gross: string) {
    const g = Number(gross)
    const c = Number(form.commission_amount)
    setForm(f => ({ ...f, gross_amount: gross, net_amount: String(c > 0 ? g - c : '') }))
  }

  function handleCommissionChange(commission: string) {
    const g = Number(form.gross_amount)
    const c = Number(commission)
    setForm(f => ({ ...f, commission_amount: commission, net_amount: String(g > 0 ? g - c : '') }))
  }

  async function handleSave() {
    if (!form.supplier_id) return alert('중기업체를 선택해 주세요.')
    setSaving(true)
    const payload = {
      ...form,
      gross_amount: form.gross_amount ? Number(form.gross_amount) : null,
      commission_amount: form.commission_amount ? Number(form.commission_amount) : null,
      net_amount: form.net_amount ? Number(form.net_amount) : null,
    }
    if (isEdit) {
      await supabase.from('settlements').update(payload).eq('id', settlement.id)
    } else {
      await supabase.from('settlements').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '정산 수정' : '정산 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Row label="중기업체 *">
            <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={inp}>
              <option value="">선택</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Row>
          <Row label="기간 시작">
            <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)} className={inp} />
          </Row>
          <Row label="기간 종료">
            <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)} className={inp} />
          </Row>
          <hr className="border-gray-100" />
          <Row label="청구금액">
            <div className="relative">
              <input type="number" value={form.gross_amount} onChange={e => handleGrossChange(e.target.value)}
                className={inp} placeholder="0" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>
          <Row label="공제액">
            <div className="relative">
              <input type="number" value={form.commission_amount} onChange={e => handleCommissionChange(e.target.value)}
                className={inp} placeholder="0" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>
          <Row label="지급금액">
            <div className="relative">
              <input type="number" value={form.net_amount} onChange={e => set('net_amount', e.target.value)}
                className={inp + ' bg-gray-50'} placeholder="자동계산" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>
          <Row label="상태">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              <option value="pending">미지급</option>
              <option value="paid">지급완료</option>
            </select>
          </Row>
          <Row label="메모">
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
              className={inp + ' resize-none'} rows={2} placeholder="비고" />
          </Row>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-24 text-sm text-gray-500 pt-2.5 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}
