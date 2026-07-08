'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Equipment, Supplier } from '@/lib/types'

interface Props {
  equipment: Equipment | null
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
  defaultOwnership?: 'own' | 'other'
}

export default function EquipmentModal({ equipment, suppliers, onClose, onSaved, defaultOwnership = 'own' }: Props) {
  const isEdit = !!equipment
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('건설기계등록증')
  const [expireDate, setExpireDate] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<{ id: string; doc_type: string; file_name: string; file_url: string; expire_date?: string }[]>([])

  useEffect(() => {
    if (!equipment?.id) return
    supabase.from('documents').select('*').eq('ref_id', equipment.id).order('created_at', { ascending: false })
      .then(({ data }: { data: any[] | null }) => setDocs(data ?? []))
  }, [equipment?.id])

  async function handleDeleteDoc(docId: string, fileUrl: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.storage.from('documents').remove([fileUrl])
    await supabase.from('documents').delete().eq('id', docId)
    setDocs(d => d.filter(doc => doc.id !== docId))
  }

  const ownership = (equipment as any)?.ownership ?? defaultOwnership
  const isOther = ownership === 'other'

  const [form, setForm] = useState({
    supplier_id: equipment?.supplier_id ?? '',
    type: equipment?.type ?? 'excavator',
    plate_no: equipment?.plate_no ?? '',
    model: equipment?.model ?? '',
    spec: equipment?.spec ?? '',
    reg_no: equipment?.reg_no ?? '',
    year: equipment?.year ?? '',
    inspection_expire: equipment?.inspection_expire ?? '',
    insurance_expire: equipment?.insurance_expire ?? '',
    insurance_premium: equipment?.insurance_premium ?? '',
    bank_account: (equipment as any)?.bank_account ?? '',
    status: equipment?.status ?? 'available',
    memo: equipment?.memo ?? '',
  })

  function set(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.supplier_id) return alert('소속 업체를 선택해 주세요.')
    setSaving(true)
    const payload = {
      ...form,
      year: form.year ? Number(form.year) : null,
      insurance_premium: form.insurance_premium ? Number(form.insurance_premium) : null,
      ownership,
    }
    if (isEdit) {
      await supabase.from('equipment').update(payload).eq('id', equipment.id)
    } else {
      await supabase.from('equipment').insert(payload)
    }
    setSaving(false)
    onSaved()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !equipment?.id) return

    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${equipment.id}/${Date.now()}.${ext}`

    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) { alert('업로드 실패: ' + error.message); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)

    const { data: inserted } = await supabase.from('documents').insert({
      ref_type: 'equipment',
      ref_id: equipment.id,
      doc_type: docType,
      file_url: path,
      file_name: file.name,
      expire_date: expireDate || null,
    }).select().single()

    if (inserted) setDocs(d => [inserted, ...d])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  function formatDateOnBlur(v: string) {
    const d = v.replace(/[^\d]/g, '')
    if (d.length < 8) return v
    return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8)
  }

  function addDays(dateStr: string, days: number) {
    if (!dateStr || dateStr.length < 10) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-bold text-gray-900">{isEdit ? '장비 수정' : '장비 등록'}</h2>
            {isOther && selectedSupplier?.ceo_name && (
              <p className="text-xs text-gray-400 mt-0.5">대표자: <span className="text-gray-600 font-medium">{selectedSupplier.ceo_name}</span></p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">X</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 소속업체 */}
          <Row label="소속업체 *">
            <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} className={inp}>
              <option value="">선택</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.ceo_name ? `${s.name} (대표: ${s.ceo_name})` : s.name}</option>)}
            </select>
          </Row>

          {/* 종류 */}
          <Row label="장비 종류 *">
            <div className="flex gap-2">
              {([
                { value: 'excavator', label: '굴삭기' },
                { value: 'dump', label: '🚛 덤프트럭' },
                { value: 'truck', label: '🚚 화물차' },
              ]).map(t => (
                <button key={t.value} type="button"
                  onClick={() => set('type', t.value)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
                    form.type === t.value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {t.value === 'excavator'
                    ? <><img src="/icons/excavator.svg" width={16} height={16} alt="" />{t.label}</>
                    : t.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="규격">
            <input value={form.spec} onChange={e => set('spec', e.target.value)}
              className={inp} placeholder="굴삭기: 0.4m3 / 덤프: 25톤" />
          </Row>
          <Row label="차량번호">
            <input value={form.plate_no} onChange={e => set('plate_no', e.target.value)}
              className={inp} placeholder="12가 3456" />
          </Row>
          <Row label="모델명">
            <input value={form.model} onChange={e => set('model', e.target.value)}
              className={inp} placeholder="현대 210-7" />
          </Row>

          {isOther ? (
            <Row label="계좌번호">
              <input value={form.bank_account} onChange={e => set('bank_account', e.target.value)}
                className={inp} placeholder="국민 123-456-789012" />
            </Row>
          ) : (
            <>
              <Row label="차대일련번호">
                <input value={form.reg_no} onChange={e => set('reg_no', e.target.value)}
                  className={inp} placeholder="차대번호 입력" />
              </Row>
              <Row label="연식">
                <input type="number" value={form.year} onChange={e => set('year', e.target.value)}
                  className={inp} placeholder="2020" />
              </Row>
              <hr className="border-gray-100" />
              <Row label="정기검사일 (기준)">
                <input type="text" value={form.inspection_expire}
                  onChange={e => set('inspection_expire', e.target.value)}
                  onBlur={e => set('inspection_expire', formatDateOnBlur(e.target.value))}
                  placeholder="YYYY-MM-DD" maxLength={10} className={inp} />
                {form.inspection_expire?.length === 10 && (
                  <p className="text-xs text-blue-600 mt-1">실제 만료일: {addDays(form.inspection_expire, 30)} (+30일)</p>
                )}
              </Row>
              <Row label="보험 만료">
                <input type="text" value={form.insurance_expire}
                  onChange={e => set('insurance_expire', e.target.value)}
                  onBlur={e => set('insurance_expire', formatDateOnBlur(e.target.value))}
                  placeholder="YYYY-MM-DD" maxLength={10} className={inp} />
              </Row>
              <Row label="보험료 (원)">
                <div className="relative">
                  <input type="number" value={form.insurance_premium}
                    onChange={e => set('insurance_premium', e.target.value)}
                    className={inp} placeholder="연간 보험료" />
                  <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
                </div>
              </Row>
            </>
          )}

          <Row label="상태">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              <option value="available">대기</option>
              <option value="dispatched">배차중</option>
              <option value="maintenance">정비중</option>
            </select>
          </Row>
          <Row label="메모">
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
              className={inp + ' resize-none'} rows={2} placeholder="비고" />
          </Row>

          {/* 서류 업로드 - 수정 모드에서만 */}
          {isEdit && (
            <>
              <hr className="border-gray-100" />
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">서류 업로드</p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select value={docType} onChange={e => setDocType(e.target.value)}
                      className={inp + ' flex-1'}>
                      <option>건설기계등록증</option>
                      <option>정기검사증</option>
                      <option>보험증권</option>
                      <option>기타</option>
                    </select>
                    <input type="date" value={expireDate} onChange={e => setExpireDate(e.target.value)}
                      className={inp + ' flex-1'} placeholder="만료일" />
                  </div>
                  <label className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors">
                    {uploading ? '업로드 중...' : '사진/파일 선택'}
                    <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFileUpload}
                      className="hidden" disabled={uploading} />
                  </label>
                </div>
                {docs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {docs.map(doc => {
                      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(doc.file_url)
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name ?? '')
                      return (
                        <div key={doc.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg">{isImage ? '🖼️' : '📄'}</span>
                            <div className="min-w-0">
                              <a href={publicUrl} target="_blank" rel="noreferrer"
                                className="text-xs font-medium text-blue-600 hover:underline truncate block max-w-[200px]">
                                {doc.file_name}
                              </a>
                              <p className="text-xs text-gray-400">{doc.doc_type}{doc.expire_date ? ` · 만료 ${doc.expire_date}` : ''}</p>
                            </div>
                          </div>
                          <button onClick={() => handleDeleteDoc(doc.id, doc.file_url)}
                            className="text-xs text-red-400 hover:text-red-600 shrink-0 ml-2">삭제</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          {!isEdit && (
            <p className="text-xs text-gray-400">* 서류 업로드는 장비 등록 후 수정 화면에서 가능합니다.</p>
          )}
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
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-600">{label}</label>
      <div>{children}</div>
    </div>
  )
}
