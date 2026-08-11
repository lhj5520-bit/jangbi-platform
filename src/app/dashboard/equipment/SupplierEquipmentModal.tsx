'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Equipment, Supplier } from '@/lib/types'

interface DocItem {
  id: string; doc_type: string; file_name: string; file_url: string; expire_date?: string
}

export interface CompanyInfo {
  name: string; reg_no: string; ceo: string; address: string
  biz_type: string; biz_item: string; bank: string; phone: string
}

interface StampItem { name: string; data: string }

interface Props {
  equipment: Equipment | null       // null = 신규 등록
  suppliers: Supplier[]
  onClose: () => void
  onSaved: (companyInfo?: CompanyInfo, supplierId?: string) => void
  defaultSupplierId?: string        // 거래명세서에서 전달
  ownership?: 'own' | 'other'
  allowCreate?: boolean             // 중기업체 신규 등록 모드 허용
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: '㈜가온건설중기', reg_no: '315-81-39390', ceo: '이현정',
  address: '청주시 흥덕구 옥산면 오산덕촌길 57-21',
  biz_type: '건설업', biz_item: '건설장비 운영업',
  bank: '농협 351-1301-4357-03', phone: '010-5596-2177',
}

function loadCompanyFromStorage(supId?: string): CompanyInfo {
  try {
    if (supId) {
      const perSup = localStorage.getItem(`ts_company_sup_${supId}`)
      if (perSup) return JSON.parse(perSup)
    }
    // 글로벌 ts_company 폴백 제거 — 업체 간 정보 오염 방지
  } catch {}
  return DEFAULT_COMPANY
}

function loadStampList(): StampItem[] {
  try {
    const list = localStorage.getItem('ts_stamp_list')
    if (list) return JSON.parse(list)
    const single = localStorage.getItem('ts_stamp')
    if (single) return [{ name: '도장1', data: single }]
  } catch {}
  return []
}

const DOC_SHARE_TITLE = '요청하신 장비서류 보내드립니다.'

function toImageShareFile(blob: Blob, name?: string, path?: string) {
  const fallbackName = path?.split('/').pop() || '서류'
  const rawName = (name || fallbackName).split('?')[0]
  const decodedName = decodeURIComponent(rawName)
  const fallbackType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : ''
  const extType =
    /\.(jpg|jpeg)$/i.test(decodedName) ? 'image/jpeg' :
    /\.png$/i.test(decodedName) ? 'image/png' :
    /\.webp$/i.test(decodedName) ? 'image/webp' :
    fallbackType.startsWith('image/') ? fallbackType :
    ''
  if (!extType) return null
  const fileName = /\.(jpg|jpeg|png|webp)$/i.test(decodedName) ? decodedName : `${decodedName}.jpg`
  return new File([blob], fileName, { type: extType })
}

export default function SupplierEquipmentModal({
  equipment, suppliers, onClose, onSaved,
  defaultSupplierId = '', ownership = 'other', allowCreate = false,
}: Props) {
  const supabase = createClient()
  const isEdit = !!equipment
  const [saving, setSaving] = useState(false)
  const stampInputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── selectedSupId 먼저 선언 (docRefId가 참조해야 하므로) ───
  const [selectedSupId, setSelectedSupId] = useState(defaultSupplierId)

  // ── 서류 ───────────────────────────────────────────────────
  const [docs, setDocs] = useState<DocItem[]>([])
  const [docType, setDocType] = useState('건설기계등록증')
  const [expireDate, setExpireDate] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [sharing, setSharing] = useState(false)

  function toggleDoc(id: string) {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAllDocs() {
    setSelectedDocIds(prev => prev.size === docs.length ? new Set() : new Set(docs.map(d => d.id)))
  }

  async function handleDeleteSelectedDocs() {
    if (selectedDocIds.size === 0) return
    if (!confirm(`선택한 ${selectedDocIds.size}개의 서류를 삭제하시겠습니까?`)) return
    const toDelete = docs.filter(d => selectedDocIds.has(d.id))
    for (const doc of toDelete) {
      await supabase.storage.from('documents').remove([doc.file_url])
      await supabase.from('documents').delete().eq('id', doc.id)
    }
    setDocs(d => d.filter(doc => !selectedDocIds.has(doc.id)))
    setSelectedDocIds(new Set())
  }

  async function handleShareDocs() {
    const toShare = docs.filter(d => selectedDocIds.has(d.id))
    if (toShare.length === 0) { alert('공유할 서류를 선택하세요.'); return }
    setSharing(true)
    let files: File[] = []
    try {
      files = []
      for (const doc of toShare) {
        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(doc.file_url)
        const resp = await fetch(publicUrl)
        const blob = await resp.blob()
        const file = toImageShareFile(blob, doc.file_name, doc.file_url)
        if (file) files.push(file)
      }
      if (!files.length) {
        alert('문자로 공유할 그림파일이 없습니다. JPG/PNG 사진 서류만 문자로 바로 보낼 수 있습니다.')
        setSharing(false)
        return
      }
      if (typeof navigator.share !== 'function') {
        alert('이 화면에서는 문자로 그림파일 공유를 지원하지 않습니다. 안드로이드 앱에서 다시 시도해 주세요.')
        setSharing(false)
        return
      }
      await navigator.share({ files, title: DOC_SHARE_TITLE })
    } catch (e: any) {
      if (e?.name !== 'AbortError') alert('문자 앱으로 그림파일 공유를 열지 못했습니다. 다시 시도해 주세요.')
    }
    setSharing(false)
  }

  // 서류 ref: 장비 수정모드면 equipment.id, 업체 모드면 selectedSupId (동적)
  const docRefId = equipment?.id ?? selectedSupId
  const docRefType = equipment?.id ? 'equipment' : 'supplier'

  useEffect(() => {
    if (!docRefId) return
    supabase.from('documents').select('*').eq('ref_id', docRefId).order('created_at', { ascending: false })
      .then(({ data }: { data: any }) => setDocs(data ?? []))
  }, [docRefId])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    const refId = equipment?.id ?? selectedSupId
    if (files.length === 0 || !refId) return
    setUploading(true)
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `${refId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file)
      if (error) { alert('업로드 실패: ' + error.message); continue }
      const { data: inserted } = await supabase.from('documents').insert({
        ref_type: docRefType, ref_id: refId,
        doc_type: '', file_url: path, file_name: file.name,
        expire_date: null,
      }).select().single()
      if (inserted) setDocs(d => [inserted, ...d])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDeleteDoc(docId: string, fileUrl: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.storage.from('documents').remove([fileUrl])
    await supabase.from('documents').delete().eq('id', docId)
    setDocs(d => d.filter(doc => doc.id !== docId))
  }

  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replacingDocRef = useRef<{ id: string; fileUrl: string } | null>(null)

  async function handleReplaceDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const target = replacingDocRef.current
    const refId = equipment?.id ?? selectedSupId
    if (!file || !target || !refId) return
    e.target.value = ''
    setUploading(true)
    // 기존 파일 스토리지에서 삭제
    await supabase.storage.from('documents').remove([target.fileUrl])
    // 새 파일 업로드
    const ext = file.name.split('.').pop()
    const path = `${refId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) { alert('업로드 실패: ' + error.message); setUploading(false); return }
    // DB 업데이트
    await supabase.from('documents').update({ file_url: path, file_name: file.name }).eq('id', target.id)
    setDocs(d => d.map(doc => doc.id === target.id ? { ...doc, file_url: path, file_name: file.name } : doc))
    setUploading(false)
    replacingDocRef.current = null
  }

  // ── 회사 정보 ──────────────────────────────────────────────
  // 초기값: 업체별 캐시 있으면 로드, 없으면 빈 상태 (useEffect에서 DB auto-fill)
  // 글로벌 ts_company 폴백 제거 — 업체 간 정보 오염 방지
  const [company, setCompany] = useState<CompanyInfo>(() => {
    if (defaultSupplierId) {
      // 업체별 저장된 캐시만 사용
      const perSup = localStorage.getItem(`ts_company_sup_${defaultSupplierId}`)
      if (perSup) try { return JSON.parse(perSup) } catch {}
      // 없으면 빈 상태 (useEffect에서 DB auto-fill)
      return { name: '', reg_no: '', ceo: '', address: '', biz_type: '', biz_item: '', bank: '', phone: '' }
    }
    // 신규 등록 모드면 빈 폼, 아니면(거래명세서 공급자 정보) 기본 회사정보
    return allowCreate
      ? { name: '', reg_no: '', ceo: '', address: '', biz_type: '', biz_item: '', bank: '', phone: '' }
      : DEFAULT_COMPANY
  })

  // ── 장비 폼 ────────────────────────────────────────────────
  const [form, setForm] = useState({
    supplier_id: equipment?.supplier_id ?? defaultSupplierId,
    type: equipment?.type ?? 'excavator',
    plate_no: equipment?.plate_no ?? '',
    model: equipment?.model ?? '',
    spec: equipment?.spec ?? '',
    bank_account: (equipment as any)?.bank_account ?? '',
    inspection_expire: equipment?.inspection_expire ?? '',
    insurance_expire: (equipment as any)?.insurance_expire ?? '',
    insurance_premium: String((equipment as any)?.insurance_premium ?? ''),
    status: equipment?.status ?? 'available',
    memo: equipment?.memo ?? '',
  })
  function setF(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // ── 업체 소속 장비 목록 (중기업체에서 열릴 때) ──────────────
  const [supplierEquipList, setSupplierEquipList] = useState<any[]>([])
  const [editEquipId, setEditEquipId] = useState<string | null>(null)

  useEffect(() => {
    const supId = selectedSupId || defaultSupplierId
    if (!supId || isEdit) return
    supabase.from('equipment').select('*').eq('supplier_id', supId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = data ?? []
        setSupplierEquipList(list)
        // 첫 번째 장비 자동 로드
        if (list.length > 0) {
          const eq = list[0]
          setEditEquipId(eq.id)
          setForm(f => ({
            ...f,
            type: eq.type ?? 'excavator',
            plate_no: eq.plate_no ?? '',
            model: eq.model ?? '',
            spec: eq.spec ?? '',
            bank_account: eq.bank_account ?? '',
            inspection_expire: eq.inspection_expire ?? '',
            insurance_expire: eq.insurance_expire ?? '',
            insurance_premium: String(eq.insurance_premium ?? ''),
            status: eq.status ?? 'available',
            memo: eq.memo ?? '',
          }))
        }
      })
  }, [selectedSupId, defaultSupplierId, isEdit])

  function loadEquipIntoForm(eq: any) {
    setEditEquipId(eq.id)
    setForm({
      supplier_id: eq.supplier_id,
      type: eq.type ?? 'excavator',
      plate_no: eq.plate_no ?? '',
      model: eq.model ?? '',
      spec: eq.spec ?? '',
      bank_account: eq.bank_account ?? '',
      inspection_expire: eq.inspection_expire ?? '',
      insurance_expire: eq.insurance_expire ?? '',
      insurance_premium: String(eq.insurance_premium ?? ''),
      status: eq.status ?? 'available',
      memo: eq.memo ?? '',
    })
  }

  function resetEquipForm() {
    setEditEquipId(null)
    setForm(f => ({
      ...f,
      type: 'excavator', plate_no: '', model: '', spec: '',
      bank_account: '', inspection_expire: '', insurance_expire: '',
      insurance_premium: '', status: 'available', memo: '',
    }))
  }

  // ── 도장 ───────────────────────────────────────────────────
  const [stampList, setStampList] = useState<StampItem[]>(loadStampList)
  // 초기값을 useState 초기화 함수에서 동기적으로 읽음 (useEffect 타이밍 이슈 방지)
  const [stampImg, setStampImg] = useState<string>(() => {
    const supId = equipment?.supplier_id ?? defaultSupplierId
    return supId ? (localStorage.getItem(`ts_stamp_sup_${supId}`) ?? '') : ''
  })
  const [stampSize, setStampSize] = useState(48)

  // 업체가 바뀌면 항상 해당 업체의 도장으로 동기화 — DB 우선, localStorage는 캐시
  useEffect(() => {
    const supId = selectedSupId || defaultSupplierId
    if (!supId) { setStampImg(''); return }
    const local = localStorage.getItem(`ts_stamp_sup_${supId}`) ?? ''
    setStampImg(local)
    supabase.from('suppliers').select('stamp_data').eq('id', supId).single()
      .then(({ data }: { data: { stamp_data?: string | null } | null }) => {
        const dbStamp = data?.stamp_data ?? ''
        if (dbStamp) {
          setStampImg(dbStamp)
          try { localStorage.setItem(`ts_stamp_sup_${supId}`, dbStamp) } catch {}
        } else if (local) {
          // 로컬에만 있으면 DB로 마이그레이션 (도장 유실 방지)
          supabase.from('suppliers').update({ stamp_data: local }).eq('id', supId).then(() => {})
        }
      })
  }, [selectedSupId, defaultSupplierId])

  // 초기 회사정보: 항상 DB(suppliers 테이블) 데이터를 우선 사용 (localStorage 오염 방지)
  useEffect(() => {
    if (!defaultSupplierId) return
    const sup = suppliers.find(s => s.id === defaultSupplierId)
    if (!sup) return
    const bank = sup.bank_name && sup.bank_account
      ? `${sup.bank_name} ${sup.bank_account}${sup.bank_holder ? ` (${sup.bank_holder})` : ''}`
      : ''
    const fromDB = {
      name: sup.name ?? '',
      reg_no: sup.business_no ?? '',
      ceo: sup.ceo_name ?? '',
      address: sup.address ?? '',
      phone: sup.contact ?? '',
      bank,
      biz_type: (sup as any).biz_type ?? '',
      biz_item: (sup as any).biz_item ?? '',
    }
    setCompany(fromDB)
    // 업체별 키에만 캐시 (글로벌 ts_company 건드리지 않음)
    try { localStorage.setItem(`ts_company_sup_${defaultSupplierId}`, JSON.stringify(fromDB)) } catch {}
  }, [defaultSupplierId, suppliers])

  // 업체 변경 시 자동입력 — 항상 DB(suppliers 테이블) 데이터 사용 (localStorage 오염 방지)
  function handleSupplierChange(supId: string) {
    setF('supplier_id', supId)
    setSelectedSupId(supId)

    const sup = suppliers.find(s => s.id === supId)
    if (sup) {
      const bank = sup.bank_name && sup.bank_account
        ? `${sup.bank_name} ${sup.bank_account}${sup.bank_holder ? ` (${sup.bank_holder})` : ''}`
        : ''
      const fromDB = {
        name: sup.name ?? '',
        reg_no: sup.business_no ?? '',
        ceo: sup.ceo_name ?? '',
        address: sup.address ?? '',
        phone: sup.contact ?? '',
        bank,
        biz_type: (sup as any).biz_type ?? '',
        biz_item: (sup as any).biz_item ?? '',
      }
      setCompany(fromDB)
      // 업체별 키에만 캐시 (글로벌 ts_company 건드리지 않음)
      try { localStorage.setItem(`ts_company_sup_${supId}`, JSON.stringify(fromDB)) } catch {}

      // 도장: 업체별 키만 사용 (글로벌 폴백 없음 — 업체 간 도장 혼용 방지)
      const perSup = localStorage.getItem(`ts_stamp_sup_${supId}`)
      setStampImg(perSup ?? '')
    }
  }

  // 도장 선택 — 항상 업체별 키에만 저장 (글로벌 ts_stamp 건드리지 않음)
  function selectStamp(data: string) {
    setStampImg(data)
    if (selectedSupId) {
      try { localStorage.setItem(`ts_stamp_sup_${selectedSupId}`, data) } catch {}
      // DB에도 저장 → 기기/브라우저 바뀌어도 유지
      supabase.from('suppliers').update({ stamp_data: data }).eq('id', selectedSupId).then(() => {})
    }
    // selectedSupId 없으면 저장 안 함 (업체 미선택 상태)
  }

  // 도장 업로드
  function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const data = ev.target?.result as string
      const name = prompt('도장 이름', `도장${stampList.length + 1}`) || `도장${stampList.length + 1}`
      const newList = [...stampList, { name, data }]
      setStampList(newList)
      localStorage.setItem('ts_stamp_list', JSON.stringify(newList))
      selectStamp(data)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // 도장 삭제
  function deleteStamp(i: number) {
    const newList = stampList.filter((_, j) => j !== i)
    setStampList(newList)
    localStorage.setItem('ts_stamp_list', JSON.stringify(newList))
    const next = newList[0]?.data ?? ''
    if (stampImg === stampList[i].data) {
      setStampImg(next)
      if (selectedSupId) localStorage.setItem(`ts_stamp_sup_${selectedSupId}`, next)
    }
  }

  // 날짜 자동 포맷 (8자리 숫자 → YYYY-MM-DD)
  function fmtDate(v: string) {
    const d = v.replace(/[^\d]/g, '')
    if (d.length < 8) return v
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  }

  // ── 저장 ───────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)

    // company.bank 문자열 파싱 → "농협 401143-56-266600 (홍길동)"
    const bankStr = (company.bank ?? '').trim()
    const holderMatch = bankStr.match(/\(([^)]+)\)/)
    const bankHolder = holderMatch ? holderMatch[1] : ''
    const withoutHolder = bankStr.replace(/\s*\([^)]*\)/, '').trim()
    const spaceIdx = withoutHolder.indexOf(' ')
    const bankName = spaceIdx >= 0 ? withoutHolder.slice(0, spaceIdx) : withoutHolder
    const bankAccount = spaceIdx >= 0 ? withoutHolder.slice(spaceIdx + 1).trim() : ''
    const supplierPayload = {
      name: company.name,
      ceo_name: company.ceo,
      contact: company.phone,
      address: company.address,
      business_no: company.reg_no,
      biz_type: company.biz_type,
      biz_item: company.biz_item,
      bank_name: bankName || null,
      bank_account: bankAccount || null,
      bank_holder: bankHolder || null,
    }

    // 회사 정보 저장: 기존 업체 update / 신규 등록 모드 insert / 그 외 글로벌(거래명세서 공급자)
    let activeSupId = selectedSupId
    if (selectedSupId) {
      localStorage.setItem(`ts_company_sup_${selectedSupId}`, JSON.stringify(company))
      const { error } = await supabase.from('suppliers').update(supplierPayload).eq('id', selectedSupId)
      if (error) { alert('업체 정보 저장 실패: ' + error.message); setSaving(false); return }
    } else if (allowCreate) {
      if (!company.name.trim()) { alert('상호(업체명)를 입력해 주세요.'); setSaving(false); return }
      const { data: newSup, error } = await supabase.from('suppliers')
        .insert({ ...supplierPayload, status: 'active' }).select().single()
      if (error || !newSup) { alert('업체 등록 실패: ' + (error?.message ?? '알 수 없는 오류')); setSaving(false); return }
      activeSupId = newSup.id
      setSelectedSupId(newSup.id)
      try { localStorage.setItem(`ts_company_sup_${newSup.id}`, JSON.stringify(company)) } catch {}
      if (stampImg) {
        try { localStorage.setItem(`ts_stamp_sup_${newSup.id}`, stampImg) } catch {}
        await supabase.from('suppliers').update({ stamp_data: stampImg }).eq('id', newSup.id)
      }
    } else {
      localStorage.setItem('ts_company', JSON.stringify(company))
    }

    // 장비 → DB 저장 (규격/차량번호/모델명 중 하나라도 있을 때)
    const eqSupplierId = form.supplier_id || activeSupId
    if (eqSupplierId && (form.plate_no || form.spec || form.model)) {
      // ownership은 신규 등록 시에만 지정 — 기존 장비의 자차/타사 구분을 덮어쓰지 않음
      const payload = {
        supplier_id: eqSupplierId,
        type: form.type,
        plate_no: form.plate_no || null,
        model: form.model || null,
        spec: form.spec || null,
        bank_account: form.bank_account || null,
        inspection_expire: form.inspection_expire || null,
        insurance_expire: form.insurance_expire || null,
        insurance_premium: form.insurance_premium ? Number(form.insurance_premium) : null,
        status: form.status,
        memo: form.memo || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('equipment').update(payload).eq('id', equipment!.id)
        if (error) { alert('장비 수정 실패: ' + error.message); setSaving(false); return }
      } else if (editEquipId) {
        const { error } = await supabase.from('equipment').update(payload).eq('id', editEquipId)
        if (error) { alert('장비 수정 실패: ' + error.message); setSaving(false); return }
      } else {
        const { data: inserted, error } = await supabase.from('equipment').insert({ ...payload, ownership }).select().single()
        if (error) { alert('장비 저장 실패: ' + error.message); setSaving(false); return }
        if (inserted) {
          setEditEquipId(inserted.id)
          setSupplierEquipList(prev => [inserted, ...prev.filter(e => e.id !== inserted.id)])
        }
      }
    }

    setSaving(false)
    onSaved(company, activeSupId || undefined)
  }

  // ── 스와이프 닫기 ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '업체·장비 수정' : '업체·장비 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ── 업체 선택 ── */}
          <Row label="중기업체">
            <select value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)} className={inp}>
              <option value="">-- 업체 선택하면 자동입력 --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.ceo_name ? ` (${s.ceo_name})` : ''}</option>
              ))}
            </select>
          </Row>

          {/* ── 회사 정보 ── */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">회사 정보</p>
            <div className="space-y-3">
              {([
                ['상호', 'name'], ['사업자등록번호', 'reg_no'], ['대표자', 'ceo'],
                ['사업장주소', 'address'], ['업태', 'biz_type'], ['종목', 'biz_item'],
                ['입금계좌', 'bank'], ['전화번호', 'phone'],
              ] as [string, keyof CompanyInfo][]).map(([label, key]) => (
                <Row key={key} label={label}>
                  <input value={company[key]} onChange={e => setCompany(c => ({ ...c, [key]: e.target.value }))}
                    className={inp} />
                </Row>
              ))}
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* ── 장비 정보 ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                장비 정보 {editEquipId ? <span className="text-blue-500">(수정 중)</span> : !isEdit ? <span className="text-green-500">(신규)</span> : null}
              </p>
              {!isEdit && supplierEquipList.length > 0 && (
                <button type="button" onClick={resetEquipForm}
                  className="text-xs text-gray-400 hover:text-blue-500">+ 새 장비 추가</button>
              )}
            </div>

            {/* 기존 장비 목록 (중기업체에서 열릴 때) */}
            {!isEdit && supplierEquipList.length > 0 && (
              <div className="mb-3 space-y-1">
                {supplierEquipList.map(eq => (
                  <div key={eq.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    editEquipId === eq.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}>
                    <button type="button" onClick={() => loadEquipIntoForm(eq)} className="flex-1 text-left">
                      <span className={`font-medium ${editEquipId === eq.id ? 'text-blue-700' : 'text-gray-700'}`}>
                        {eq.plate_no || '번호없음'}
                      </span>
                      {eq.spec && <span className="ml-2 text-gray-400">{eq.spec}</span>}
                      {eq.model && <span className="ml-2 text-gray-400">{eq.model}</span>}
                    </button>
                    <button type="button" onClick={async () => {
                      if (!confirm('삭제하시겠습니까?')) return
                      const { error } = await supabase.from('equipment').delete().eq('id', eq.id)
                      if (error) {
                        if (error.message.includes('foreign key')) {
                          alert('배차 기록이 연결되어 있어 삭제할 수 없습니다.\n장비(타사) 목록에서 배차를 먼저 정리해주세요.')
                        } else {
                          alert('삭제 실패: ' + error.message)
                        }
                        return
                      }
                      setSupplierEquipList(prev => prev.filter(e => e.id !== eq.id))
                      if (editEquipId === eq.id) resetEquipForm()
                    }} className="text-red-400 hover:text-red-600 text-xs shrink-0 px-1">삭제</button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <Row label="장비 종류">
                <div className="flex gap-2">
                  {([['excavator', '🏗 굴삭기'], ['dump', '🚛 덤프트럭'], ['truck', '🚚 화물차']] as [string, string][]).map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setF('type', val)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.type === val ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>{lbl}</button>
                  ))}
                </div>
              </Row>
              <Row label="규격">
                <input value={form.spec} onChange={e => setF('spec', e.target.value)} className={inp} placeholder="굴삭기: 0.4m3 / 덤프: 25톤" />
              </Row>
              <Row label="차량번호">
                <input value={form.plate_no} onChange={e => setF('plate_no', e.target.value)} className={inp} placeholder="12가 3456" />
              </Row>
              <Row label="모델명">
                <input value={form.model} onChange={e => setF('model', e.target.value)} className={inp} placeholder="현대 210-7" />
              </Row>
              <Row label="정기검사일">
                <input type="text" value={form.inspection_expire}
                  onChange={e => setF('inspection_expire', e.target.value)}
                  onBlur={e => setF('inspection_expire', fmtDate(e.target.value))}
                  className={inp} placeholder="YYYY-MM-DD" />
              </Row>
              <Row label="보험만기일">
                <input type="text" value={form.insurance_expire}
                  onChange={e => setF('insurance_expire', e.target.value)}
                  onBlur={e => setF('insurance_expire', fmtDate(e.target.value))}
                  className={inp} placeholder="YYYY-MM-DD" />
              </Row>
              <Row label="보험료">
                <input value={form.insurance_premium} onChange={e => setF('insurance_premium', e.target.value)} className={inp} placeholder="연간 보험료" />
              </Row>
              <Row label="메모">
                <textarea value={form.memo} onChange={e => setF('memo', e.target.value)}
                  className={inp + ' resize-none'} rows={2} placeholder="비고" />
              </Row>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* ── 도장 ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-500">도장</label>
              <button onClick={() => stampInputRef.current?.click()}
                className="text-xs text-blue-500 hover:underline">+ 추가</button>
            </div>
            <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
            {stampImg ? (
              <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                <img src={stampImg} alt="현재 도장" className="w-10 h-10 object-contain" />
                <span className="text-xs text-gray-500 flex-1">현재 업체에 저장된 도장</span>
                <button onClick={() => stampInputRef.current?.click()}
                  className="text-xs px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 transition-colors">
                  🔄 사진 교체
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-2">이 업체에 선택된 도장이 없습니다. 아래에서 선택하거나 업로드하세요.</p>
            )}
            {stampList.length === 0 ? (
              <button onClick={() => stampInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500">
                + 도장 이미지 업로드
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {stampList.map((s, i) => (
                  <div key={i} onClick={() => selectStamp(s.data)}
                    className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border-2 cursor-pointer transition-colors ${
                      stampImg === s.data ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-400'
                    }`} style={{ width: 80 }}>
                    <img src={s.data} alt={s.name} className="w-12 h-12 object-contain" />
                    <span className="text-xs text-gray-600 truncate w-full text-center">{s.name}</span>
                    <button className="absolute top-1 right-1 text-gray-300 hover:text-red-500 text-xs"
                      onClick={e => { e.stopPropagation(); deleteStamp(i) }}>X</button>
                  </div>
                ))}
              </div>
            )}
            {stampImg && (
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-gray-400">크기</span>
                <input type="range" min={30} max={120} value={stampSize}
                  onChange={e => setStampSize(Number(e.target.value))} className="w-24 accent-blue-600" />
                <span className="text-xs text-gray-500">{stampSize}px</span>
              </div>
            )}
          </div>

          {(isEdit || !!selectedSupId) && (
            <>
              <hr className="border-gray-100" />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">서류 업로드</p>
                <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors">
                  {uploading ? '업로드 중...' : '📎 파일 선택 (여러 개 동시 선택 가능)'}
                  <input ref={fileRef} type="file" accept="image/*,.pdf" multiple onChange={handleFileUpload} className="hidden" disabled={uploading} />
                </label>
                {docs.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {/* 전체선택 + 공유 버튼 헤더 */}
                    <div className="flex items-center justify-between px-1">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                        <input type="checkbox"
                          checked={selectedDocIds.size === docs.length && docs.length > 0}
                          onChange={toggleAllDocs}
                          className="w-3.5 h-3.5 accent-blue-600" />
                        전체선택
                      </label>
                      {selectedDocIds.size > 0 && (
                        <div className="flex gap-1.5">
                          <button onClick={handleShareDocs} disabled={sharing}
                            className="flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white">
                            {sharing ? '전송 중...' : `📤 공유 (${selectedDocIds.size}개)`}
                          </button>
                          <button onClick={handleDeleteSelectedDocs}
                            className="flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white">
                            🗑 삭제 ({selectedDocIds.size}개)
                          </button>
                        </div>
                      )}
                    </div>
                    {docs.map(doc => {
                      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(doc.file_url)
                      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.file_name ?? '')
                      return (
                        <div key={doc.id} className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${selectedDocIds.has(doc.id) ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}
                          onClick={() => toggleDoc(doc.id)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleDoc(doc.id)}
                              onClick={e => e.stopPropagation()}
                              className="w-3.5 h-3.5 accent-blue-600 shrink-0" />
                            <span className="text-sm">{isImage ? '🖼' : '📄'}</span>
                            <div className="min-w-0">
                              <a href={publicUrl} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-xs font-medium text-blue-600 hover:underline truncate block max-w-[180px]">
                                {doc.file_name}
                              </a>
                              <p className="text-xs text-gray-400">{doc.doc_type}{doc.expire_date ? ` · 만료 ${doc.expire_date}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <button onClick={e => { e.stopPropagation(); replacingDocRef.current = { id: doc.id, fileUrl: doc.file_url }; replaceInputRef.current?.click() }}
                              className="text-xs text-blue-400 hover:text-blue-600">교체</button>
                            <button onClick={e => { e.stopPropagation(); handleDeleteDoc(doc.id, doc.file_url) }}
                              className="text-xs text-red-400 hover:text-red-600">삭제</button>
                          </div>
                        </div>
                      )
                    })}
                    <input ref={replaceInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleReplaceDoc} />
                  </div>
                )}
              </div>
            </>
          )}

        </div>

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
      <label className="w-24 text-sm text-gray-500 pt-2.5 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}
