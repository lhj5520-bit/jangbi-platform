'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dispatch, Equipment, Supplier } from '@/lib/types'

interface Props {
  dispatch: Dispatch | null
  equipment: (Equipment & { supplier?: Supplier })[]
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
  large?: boolean
}

export default function DispatchModal({ dispatch, equipment, suppliers, onClose, onSaved, large }: Props) {
  const isEdit = !!dispatch
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])

  const [equipMode, setEquipMode] = useState<'select' | 'text'>(
    (dispatch as any)?.equipment_text ? 'text' : 'select'
  )

  const [form, setForm] = useState({
    client_name: (dispatch as any)?.client_name ?? '',
    site_name: (dispatch as any)?.site_name ?? '',
    equipment_id: dispatch?.equipment_id ?? '',
    equipment_text: (dispatch as any)?.equipment_text ?? '',
    supplier_id: dispatch?.supplier_id ?? '',
    driver_name: (dispatch as any)?.driver_name ?? '',
    start_date: dispatch?.start_date ?? '',
    end_date: dispatch?.end_date ?? '',
    unit_type: dispatch?.unit_type ?? 'hour',
    client_unit_price: dispatch?.client_unit_price ?? '',
    supplier_unit_price: dispatch?.supplier_unit_price ?? '',
    commission_amount: dispatch?.commission_amount ?? '',
    status: dispatch?.status ?? 'active',
    memo: dispatch?.memo ?? '',
  })
  const WORK_TYPES = ['버켓', '뿌레카', '집게', '기타']
  const isDump = equipMode === 'select'
    ? equipment.find(e => e.id === form.equipment_id)?.type === 'dump'
    : (form.equipment_text ?? '').includes('덤프')
  const [workItems, setWorkItems] = useState<{ type: string; hours: string; unit_price: string }[]>(
    ((dispatch as any)?.work_items ?? []).map((w: any) => ({
      type: w.type ?? '버켓',
      hours: String(w.hours ?? ''),
      unit_price: String(w.unit_price ?? ''),
    }))
  )
  const workTotal = workItems.reduce((s, w) => s + (Number(w.hours) || 0) * (Number(w.unit_price) || 0), 0)

  function addWorkItem() {
    const isDumpNow = equipMode === 'select'
      ? equipment.find(e => e.id === form.equipment_id)?.type === 'dump'
      : (form.equipment_text ?? '').includes('덤프')
    setWorkItems(prev => [...prev, { type: isDumpNow ? '운반' : '버켓', hours: '', unit_price: '' }])
  }
  function removeWorkItem(idx: number) {
    setWorkItems(prev => prev.filter((_, i) => i !== idx))
  }
  function updateWorkItem(idx: number, field: 'type' | 'hours' | 'unit_price', value: string) {
    setWorkItems(prev => prev.map((w, i) => i === idx ? { ...w, [field]: value } : w))
  }

  const [clientOptions, setClientOptions] = useState<string[]>([])
  const [plateOptions, setPlateOptions] = useState<string[]>([])
  useEffect(() => {
    supabase.from('invoices').select('client_name').then(({ data }) => {
      setClientOptions([...new Set((data ?? []).map((r: any) => r.client_name).filter(Boolean))].sort())
    })
    supabase.from('equipment').select('plate_no').then(({ data }) => {
      setPlateOptions((data ?? []).map((r: any) => r.plate_no).filter(Boolean))
    })
  }, [])

  function handleEquipmentChange(equipmentId: string) {
    const eq = equipment.find(e => e.id === equipmentId)
    setForm(f => ({
      ...f,
      equipment_id: equipmentId,
      supplier_id: eq?.supplier_id ?? f.supplier_id,
    }))
  }

  function handlePriceChange(price: string, commission: string) {
    const p = Number(price)
    const c = Number(commission)
    const supplierPrice = p > 0 ? p - c : ''
    setForm(f => ({ ...f, client_unit_price: price, commission_amount: commission, supplier_unit_price: String(supplierPrice) }))
  }

  function handleDriverNameChange(name: string) {
    const matched = suppliers.find(s => s.ceo_name && s.ceo_name.replace(/\s/g, '') === name.replace(/\s/g, ''))
    setForm(f => ({
      ...f,
      driver_name: name,
      supplier_id: matched ? matched.id : f.supplier_id,
    }))
  }

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.site_name) return alert('현장명을 입력해 주세요.')
    if (equipMode === 'select' && !form.equipment_id) return alert('장비를 선택해 주세요.')
    if (equipMode === 'text' && !form.equipment_text) return alert('장비를 입력해 주세요.')
    if (!form.driver_name) return alert('차주명을 입력해 주세요.')
    if (!form.start_date) return alert('시작일을 입력해 주세요.')
    setSaving(true)
    const payload = {
      site_name: form.site_name,
      equipment_id: equipMode === 'select' ? (form.equipment_id || null) : null,
      equipment_text: equipMode === 'text' ? (form.equipment_text || null) : null,
      supplier_id: form.supplier_id || null,
      driver_name: form.driver_name,
      start_date: form.start_date,
      end_date: form.end_date || null,
      unit_type: form.unit_type,
      client_name: form.client_name || null,
      client_unit_price: workItems.length > 0 ? null : (form.client_unit_price ? Number(form.client_unit_price) : null),
      supplier_unit_price: form.supplier_unit_price ? Number(form.supplier_unit_price) : null,
      commission_rate: null,
      commission_amount: workItems.length > 0 ? null : (form.commission_amount ? Number(form.commission_amount) : null),
      status: form.status,
      memo: form.memo || null,
      work_items: workItems.length > 0
        ? workItems.map(w => ({ type: w.type, hours: Number(w.hours) || 0, unit_price: Number(w.unit_price) || 0 }))
        : [],
    }
    if (isEdit) {
      await supabase.from('dispatches').update(payload).eq('id', dispatch.id)
    } else {
      await supabase.from('dispatches').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
  const matchedSupplier = form.driver_name
    ? suppliers.find(s => s.ceo_name && s.ceo_name.replace(/\s/g, '') === form.driver_name.replace(/\s/g, ''))
    : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl w-full ${large ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto shadow-xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '배차 수정' : '배차 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">X</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Row label="발주처">
            <input list="client-options" value={form.client_name} onChange={e => set('client_name', e.target.value)}
              className={inp} placeholder="발주처 업체명" />
            <datalist id="client-options">
              {clientOptions.map(c => <option key={c} value={c} />)}
            </datalist>
          </Row>

          <Row label="현장 *">
            <input value={form.site_name} onChange={e => set('site_name', e.target.value)}
              className={inp} placeholder="현장명 직접 입력" />
          </Row>

          <Row label="장비 *">
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setEquipMode('select')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${equipMode === 'select' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                기존 장비
              </button>
              <button type="button" onClick={() => setEquipMode('text')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${equipMode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                직접 입력
              </button>
            </div>
            {equipMode === 'select' ? (
              <select value={form.equipment_id} onChange={e => handleEquipmentChange(e.target.value)} className={inp}>
                <option value="">선택</option>
                {equipment.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.type === 'excavator' ? '[굴삭기]' : e.type === 'dump' ? '[덤프]' : '[화물]'} {e.plate_no} {e.spec ?? ''}{(e.supplier as Supplier)?.name ? ` - ${(e.supplier as Supplier).name}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input list="plate-options" value={form.equipment_text} onChange={e => set('equipment_text', e.target.value)}
                  className={inp} placeholder="예: 덤프 25톤 12가3456 또는 차량번호 입력" />
                <datalist id="plate-options">
                  {plateOptions.map(p => <option key={p} value={p} />)}
                </datalist>
              </>
            )}
          </Row>

          <Row label="중기업체">
            <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={inp}>
              <option value="">선택</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {selectedSupplier && (
              <p className="text-xs text-gray-400 mt-1">기본 공제액: {selectedSupplier.commission_rate?.toLocaleString()}원</p>
            )}
          </Row>

          <Row label="차주명 *">
            <input
              list="driver-names"
              value={form.driver_name}
              onChange={e => handleDriverNameChange(e.target.value)}
              className={inp}
              placeholder="차주 이름 입력"
            />
            <datalist id="driver-names">
              {suppliers.filter(s => s.ceo_name).map(s => (
                <option key={s.id} value={s.ceo_name!}>{s.name}</option>
              ))}
            </datalist>
            {form.driver_name && matchedSupplier && (
              <p className="text-xs text-blue-500 mt-1">{matchedSupplier.name} 자동 연결</p>
            )}
          </Row>

          <hr className="border-gray-100" />

          <Row label="시작일 *">
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inp} />
          </Row>
          <Row label="종료일">
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inp} />
          </Row>

          <hr className="border-gray-100" />

          {/* 작업내용 (버켓/뿌레카/집게/기타) */}
          <Row label="작업내용">
            <div className="space-y-2">
              {workItems.map((item, idx) => (
                <div key={idx} className="flex gap-1.5 items-center">
                  {isDump ? (
                    <div className="px-2 py-2 border border-gray-200 rounded-lg text-sm w-20 shrink-0 bg-gray-50 text-gray-500 text-center">운반</div>
                  ) : (
                    <select value={item.type} onChange={e => updateWorkItem(idx, 'type', e.target.value)}
                      className="px-2 py-2 border border-gray-300 rounded-lg text-sm w-20 shrink-0">
                      {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  <div className="relative flex-1">
                    <input type="number" value={item.hours}
                      onChange={e => updateWorkItem(idx, 'hours', e.target.value)}
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm pr-8"
                      placeholder="시간" />
                    <span className="absolute right-2 top-2 text-xs text-gray-400">시간</span>
                  </div>
                  <div className="relative flex-1">
                    <input type="number" value={item.unit_price}
                      onChange={e => updateWorkItem(idx, 'unit_price', e.target.value)}
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm pr-6"
                      placeholder="단가" />
                    <span className="absolute right-2 top-2 text-xs text-gray-400">원</span>
                  </div>
                  <button type="button" onClick={() => removeWorkItem(idx)}
                    className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0">✕</button>
                </div>
              ))}
              <button type="button" onClick={addWorkItem}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                + 작업 추가
              </button>
              {workItems.length > 0 && (
                <div className="flex justify-between items-center pt-1 border-t border-gray-100 text-sm">
                  <span className="text-gray-500">작업 합계</span>
                  <span className="font-bold text-gray-800">{workTotal.toLocaleString()}원</span>
                </div>
              )}
            </div>
          </Row>

          {/* 작업항목이 없을 때만 기준단가 표시 */}
          {workItems.length === 0 && (<>
            <Row label="단위">
              <div className="flex gap-2">
                {(['hour', 'count', 'day'] as const).map(t => (
                  <button key={t} type="button" onClick={() => set('unit_type', t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.unit_type === t ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {t === 'hour' ? '시간' : t === 'count' ? '횟수' : '일'}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="청구단가">
              <div className="relative">
                <input type="number" value={form.client_unit_price}
                  onChange={e => handlePriceChange(e.target.value, String(form.commission_amount))}
                  className={inp} placeholder="발주처에 청구하는 단가" />
                <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
              </div>
            </Row>

            <Row label="공제액">
              <div className="relative">
                <input type="number" value={form.commission_amount}
                  onChange={e => handlePriceChange(String(form.client_unit_price), e.target.value)}
                  className={inp} placeholder="우리 회사 수익" />
                <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
              </div>
            </Row>
          </>)}

          <Row label="기사급여">
            <div className="relative">
              <input type="number" value={form.supplier_unit_price}
                onChange={e => set('supplier_unit_price', e.target.value)}
                className={inp + ' bg-gray-50'} placeholder="기사 지급 급여" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
            {workItems.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">청구단가 - 공제액 = 자동계산</p>
            )}
          </Row>

          <hr className="border-gray-100" />

          <Row label="상태">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              <option value="active">배차중</option>
              <option value="completed">완료</option>
              <option value="cancelled">취소</option>
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
