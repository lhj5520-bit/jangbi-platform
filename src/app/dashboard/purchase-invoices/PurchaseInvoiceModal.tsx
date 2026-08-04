'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PurchaseInvoice, Supplier, Project } from '@/lib/types'

interface Props {
  invoice: PurchaseInvoice | null
  suppliers: Supplier[]
  projects: Project[]
  onClose: () => void
  onSaved: () => void
}

export default function PurchaseInvoiceModal({ invoice, suppliers, projects, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])
  const [form, setForm] = useState({
    supplier_id: invoice?.supplier_id ?? '',
    supplier_name: (invoice as any)?.supplier_name ?? (invoice as any)?.supplier?.name ?? '',
    project_id: invoice?.project_id ?? '',
    issue_date: invoice?.issue_date ?? new Date().toISOString().slice(0, 10),
    period_start: invoice?.period_start ?? '',
    period_end: invoice?.period_end ?? '',
    supply_amount: String(invoice?.supply_amount ?? ''),
    vat_amount: String(invoice?.vat_amount ?? ''),
    total_amount: String(invoice?.total_amount ?? ''),
    memo: invoice?.memo ?? '',
  })

  function set(field: string, value: string) {
    setForm(f => {
      const next = { ...f, [field]: value }
      if (field === 'supply_amount') {
        const supply = Number(value) || 0
        next.vat_amount = String(Math.round(supply * 0.1))
        next.total_amount = String(Math.round(supply * 1.1))
      }
      return next
    })
  }

  async function handleSave() {
    if (!form.supplier_id && !form.supplier_name.trim()) return alert('업체명을 입력하거나 목록에서 선택해주세요.')
    if (!form.supply_amount) return alert('공급가액을 입력해주세요.')
    setSaving(true)
    const data = {
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name.trim() || null,
      project_id: form.project_id || null,
      issue_date: form.issue_date,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      supply_amount: Number(form.supply_amount),
      vat_amount: Number(form.vat_amount),
      total_amount: Number(form.total_amount),
      memo: form.memo || null,
    }
    if (invoice) {
      await supabase.from('purchase_invoices').update(data).eq('id', invoice.id)
    } else {
      await supabase.from('purchase_invoices').insert(data)
    }
    setSaving(false)
    onSaved()
  }

  const inp = 'flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{invoice ? '매입계산서 수정' : '매입계산서 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0 pt-2">업체명 *</label>
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={form.supplier_name}
                onChange={e => set('supplier_name', e.target.value)}
                placeholder="업체명 직접 입력"
                className={inp}
              />
              <select value={form.supplier_id} onChange={e => {
                const sid = e.target.value
                const sup = suppliers.find(s => s.id === sid)
                setForm(f => ({ ...f, supplier_id: sid, supplier_name: sup?.name ?? f.supplier_name }))
              }} className={`${inp} text-gray-500 text-xs`}>
                <option value="">— 목록에서 선택 (자동완성) —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">현장</label>
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inp}>
              <option value="">선택 안함</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">발행일 *</label>
            <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} className={inp} />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">기간</label>
            <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)} className={inp} />
            <span className="text-gray-400 text-sm">~</span>
            <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)} className={inp} />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">공급가액 *</label>
            <input type="number" value={form.supply_amount} onChange={e => set('supply_amount', e.target.value)}
              placeholder="0" className={inp} />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">부가세</label>
            <input type="number" value={form.vat_amount} onChange={e => set('vat_amount', e.target.value)}
              placeholder="자동계산" className={inp} />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">합계</label>
            <input type="number" value={form.total_amount} onChange={e => set('total_amount', e.target.value)}
              placeholder="자동계산" className={`${inp} font-bold`} />
          </div>
          <div className="flex items-start gap-3">
            <label className="w-24 text-sm text-gray-500 pt-2 shrink-0">메모</label>
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2} placeholder="비고" />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
