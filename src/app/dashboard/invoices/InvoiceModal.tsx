'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Invoice, Client, Project } from '@/lib/types'

interface Props {
  invoice: Invoice | null
  clients: Client[]
  projects: Project[]
  onClose: () => void
  onSaved: () => void
}

export default function InvoiceModal({ invoice, clients, projects, onClose, onSaved }: Props) {
  const isEdit = !!invoice
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])
  const [form, setForm] = useState({
    client_id: invoice?.client_id ?? '',
    project_id: invoice?.project_id ?? '',
    issue_date: invoice?.issue_date ?? new Date().toISOString().slice(0, 10),
    period_start: invoice?.period_start ?? '',
    period_end: invoice?.period_end ?? '',
    supply_amount: invoice?.supply_amount ?? '',
    vat_amount: invoice?.vat_amount ?? '',
    total_amount: invoice?.total_amount ?? '',
    status: invoice?.status ?? 'issued',
    memo: invoice?.memo ?? '',
  })

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleSupplyChange(supply: string) {
    const s = Number(supply)
    const vat = Math.round(s * 0.1)
    setForm(f => ({ ...f, supply_amount: supply, vat_amount: String(vat), total_amount: String(s + vat) }))
  }

  async function handleSave() {
    // client_id 없어도 저장 허용 (CSV 업로드 케이스)
    if (!form.issue_date) return alert('발행일을 입력해 주세요.')
    setSaving(true)
    const payload = {
      ...form,
      supply_amount: form.supply_amount ? Number(form.supply_amount) : null,
      vat_amount: form.vat_amount ? Number(form.vat_amount) : null,
      total_amount: form.total_amount ? Number(form.total_amount) : null,
      project_id: form.project_id || null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
    }
    if (isEdit) {
      await supabase.from('invoices').update(payload).eq('id', invoice.id)
    } else {
      await supabase.from('invoices').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const filteredProjects = projects.filter(p => !form.client_id || p.client_id === form.client_id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '세금계산서 수정' : '세금계산서 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Row label="발주처 *">
            <select value={form.client_id} onChange={e => set('client_id', e.target.value)} className={inp}>
              <option value="">선택</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Row>
          <Row label="현장">
            <select value={form.project_id} onChange={e => set('project_id', e.target.value)} className={inp}>
              <option value="">선택 (선택사항)</option>
              {filteredProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Row>
          <Row label="발행일 *">
            <input type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} className={inp} />
          </Row>
          <Row label="청구기간">
            <div className="flex gap-2">
              <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)} className={inp} />
              <span className="text-gray-400 pt-2">~</span>
              <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)} className={inp} />
            </div>
          </Row>
          <hr className="border-gray-100" />
          <Row label="공급가액">
            <div className="relative">
              <input type="number" value={form.supply_amount} onChange={e => handleSupplyChange(e.target.value)}
                className={inp} placeholder="0" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>
          <Row label="부가세 (10%)">
            <div className="relative">
              <input type="number" value={form.vat_amount} onChange={e => set('vat_amount', e.target.value)}
                className={inp + ' bg-gray-50'} placeholder="자동계산" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>
          <Row label="합계">
            <div className="relative">
              <input type="number" value={form.total_amount} onChange={e => set('total_amount', e.target.value)}
                className={inp + ' bg-gray-50 font-bold'} placeholder="자동계산" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>
          <Row label="상태">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              <option value="issued">발행</option>
              <option value="paid">수금완료</option>
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
