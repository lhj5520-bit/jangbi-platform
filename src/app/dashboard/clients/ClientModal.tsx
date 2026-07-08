'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/lib/types'

interface Props {
  client: Client | null
  onClose: () => void
  onSaved: () => void
}

export default function ClientModal({ client, onClose, onSaved }: Props) {
  const isEdit = !!client
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState(client?.business_reg_image_url ?? '')
  const [imagePreview, setImagePreview] = useState<string | null>(client?.business_reg_image_url ?? null)
  const [lightbox, setLightbox] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])

  const [form, setForm] = useState({
    name: client?.name ?? '',
    business_no: client?.business_no ?? '',
    ceo_name: client?.ceo_name ?? '',
    contact: client?.contact ?? '',
    manager_name: client?.manager_name ?? '',
    manager_contact: client?.manager_contact ?? '',
    address: client?.address ?? '',
    memo: client?.memo ?? '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleImageUpload(file: File) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const fileName = `clients/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(fileName, file, { upsert: true })
      if (error) { alert('업로드 실패: ' + error.message); return }
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName)
      setImageUrl(publicUrl)
      setImagePreview(publicUrl)
    } catch (e) {
      alert('업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // 미리보기
    const reader = new FileReader()
    reader.onload = ev => setImagePreview(ev.target?.result as string)
    reader.readAsDataURL(file)
    handleImageUpload(file)
  }

  async function handleSave() {
    if (!form.name) return alert('업체명을 입력해 주세요.')
    setSaving(true)
    const payload: any = { ...form }
    if (imageUrl !== undefined) payload.business_reg_image_url = imageUrl || null
    let error
    if (isEdit) {
      ;({ error } = await supabase.from('clients').update(payload).eq('id', client.id))
    } else {
      ;({ error } = await supabase.from('clients').insert(payload))
    }
    setSaving(false)
    if (error) {
      // business_reg_image_url 컬럼 없으면 해당 필드 제외 후 재시도
      if (error.message?.includes('business_reg_image_url')) {
        delete payload.business_reg_image_url
        const { error: e2 } = isEdit
          ? await supabase.from('clients').update(payload).eq('id', client.id)
          : await supabase.from('clients').insert(payload)
        if (e2) { alert('저장 실패: ' + e2.message); return }
      } else {
        alert('저장 실패: ' + error.message)
        return
      }
    }
    onSaved()
  }

  const inp = 'flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '발주처 수정' : '발주처 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {[
            { label: '사업자번호', field: 'business_no', placeholder: '000-00-00000' },
            { label: '업체명 *', field: 'name', placeholder: '라인건설(주)' },
            { label: '대표자', field: 'ceo_name', placeholder: '홍길동' },
            { label: '주소', field: 'address', placeholder: '시/군/구' },
            { label: '회사 연락처', field: 'contact', placeholder: '02-0000-0000' },
          ].map(({ label, field, placeholder }) => (
            <div key={field} className="flex items-center gap-3">
              <label className="w-24 text-sm text-gray-500 shrink-0">{label}</label>
              <input value={form[field as keyof typeof form]} onChange={e => set(field, e.target.value)}
                placeholder={placeholder} className={inp} />
            </div>
          ))}

          {/* 담당자 구분선 */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-24 shrink-0" />
            <div className="flex-1 border-t border-gray-100" />
          </div>
          <p className="text-xs text-gray-400 -mt-2 ml-0">담당자</p>

          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">담당자명</label>
            <input value={form.manager_name} onChange={e => set('manager_name', e.target.value)}
              placeholder="김담당" className={inp} />
          </div>
          <div className="flex items-center gap-3">
            <label className="w-24 text-sm text-gray-500 shrink-0">담당자 연락처</label>
            <input value={form.manager_contact} onChange={e => set('manager_contact', e.target.value)}
              placeholder="010-0000-0000" className={inp} />
          </div>

          <div className="flex items-start gap-3">
            <label className="w-24 text-sm text-gray-500 pt-2 shrink-0">메모</label>
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2} placeholder="비고" />
          </div>

          {/* 사업자등록증 사진 */}
          <div className="pt-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-24 shrink-0" />
              <div className="flex-1 border-t border-gray-100" />
            </div>
            <p className="text-xs text-gray-400 mb-3">사업자등록증</p>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {lightbox && imagePreview && (
              <div
                className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
                onClick={() => setLightbox(false)}
              >
                <img
                  src={imagePreview}
                  alt="사업자등록증 원본"
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  onClick={e => e.stopPropagation()}
                />
                <button
                  onClick={() => setLightbox(false)}
                  className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-gray-300"
                >✕</button>
              </div>
            )}

            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="사업자등록증"
                  onClick={() => setLightbox(true)}
                  className="w-full rounded-xl border border-gray-200 object-contain max-h-64 bg-gray-50 cursor-zoom-in"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white/90 hover:bg-white text-gray-700 text-xs font-medium px-2 py-1 rounded-lg shadow border border-gray-200"
                  >
                    변경
                  </button>
                  <button
                    onClick={() => { setImageUrl(''); setImagePreview(null) }}
                    className="bg-white/90 hover:bg-white text-red-500 text-xs font-medium px-2 py-1 rounded-lg shadow border border-gray-200"
                  >
                    삭제
                  </button>
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                    <span className="text-sm text-gray-500">업로드 중...</span>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-blue-300 hover:bg-blue-50/30 transition-colors disabled:opacity-50"
              >
                <span className="text-2xl">📄</span>
                <span className="text-sm text-gray-400">{uploading ? '업로드 중...' : '사진 등록 (탭하여 선택)'}</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving || uploading}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
