'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Supplier } from '@/lib/types'

interface Props {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}

export default function SupplierModal({ supplier, onClose, onSaved }: Props) {
  const isEdit = !!supplier
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])

  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    business_no: supplier?.business_no ?? '',
    ceo_name: supplier?.ceo_name ?? '',
    contact: supplier?.contact ?? '',
    manager_name: supplier?.manager_name ?? '',
    manager_contact: supplier?.manager_contact ?? '',
    address: supplier?.address ?? '',
    biz_type: (supplier as any)?.biz_type ?? '',
    biz_item: (supplier as any)?.biz_item ?? '',
    bank_name: supplier?.bank_name ?? '',
    bank_account: supplier?.bank_account ?? '',
    bank_holder: supplier?.bank_holder ?? '',
    status: supplier?.status ?? 'active',
    memo: supplier?.memo ?? '',
  })

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name) return alert('업체명을 입력해 주세요.')
    setSaving(true)
    if (isEdit) {
      await supabase.from('suppliers').update(form).eq('id', supplier.id)
    } else {
      await supabase.from('suppliers').insert(form)
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '업체 수정' : '업체 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* 폼 */}
        <div className="px-6 py-5 space-y-4">
          <Row label="업체명 *">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={input} placeholder="홍길동중기" />
          </Row>
          <Row label="사업자등록번호">
            <input value={form.business_no} onChange={e => set('business_no', e.target.value)}
              className={input} placeholder="000-00-00000" />
          </Row>
          <Row label="대표자">
            <input value={form.ceo_name} onChange={e => set('ceo_name', e.target.value)}
              className={input} placeholder="홍길동" />
          </Row>
          <Row label="주소">
            <input value={form.address} onChange={e => set('address', e.target.value)}
              className={input} placeholder="시/군/구" />
          </Row>
          <Row label="업태">
            <input value={form.biz_type} onChange={e => set('biz_type', e.target.value)}
              className={input} placeholder="건설업" />
          </Row>
          <Row label="종목">
            <input value={form.biz_item} onChange={e => set('biz_item', e.target.value)}
              className={input} placeholder="건설장비 운영업" />
          </Row>
          <Row label="연락처">
            <input value={form.contact} onChange={e => set('contact', e.target.value)}
              className={input} placeholder="010-0000-0000" />
          </Row>
          <Row label="담당자명">
            <input value={form.manager_name} onChange={e => set('manager_name', e.target.value)}
              className={input} placeholder="김담당" />
          </Row>
          <Row label="담당자 연락처">
            <input value={form.manager_contact} onChange={e => set('manager_contact', e.target.value)}
              className={input} placeholder="010-0000-0000" />
          </Row>

          <hr className="border-gray-100" />

          <Row label="은행명">
            <input value={form.bank_name} onChange={e => set('bank_name', e.target.value)}
              className={input} placeholder="국민은행" />
          </Row>
          <Row label="계좌번호">
            <input value={form.bank_account} onChange={e => set('bank_account', e.target.value)}
              className={input} placeholder="000000-00-000000" />
          </Row>
          <Row label="예금주">
            <input value={form.bank_holder} onChange={e => set('bank_holder', e.target.value)}
              className={input} placeholder="홍길동" />
          </Row>

          <hr className="border-gray-100" />

          <Row label="상태">
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className={input}>
              <option value="active">거래중</option>
              <option value="inactive">거래중단</option>
            </select>
          </Row>
          <Row label="메모">
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
              className={input + ' resize-none'} rows={2} placeholder="비고" />
          </Row>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            취소
          </button>
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
      <label className="w-28 text-sm text-gray-500 pt-2.5 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}

const input = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
