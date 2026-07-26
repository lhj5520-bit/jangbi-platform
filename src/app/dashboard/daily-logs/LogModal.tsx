'use client'

import React, { useState, useEffect, useRef } from 'react'

function equipmentTypeLabel(type?: string | null) {
  if (type === 'excavator') return '굴삭기'
  if (type === 'dump') return '덤프'
  if (type === 'cargo' || type === 'truck') return '화물'
  return type ?? ''
}

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
import { createClient } from '@/lib/supabase/client'
import { DailyLog, Dispatch, Equipment, Supplier, Client } from '@/lib/types'

const DISPATCH_DRAFT_KEY = 'jangbi:dispatch-registration-draft:v1'

interface Props {
  log: (DailyLog & { [key: string]: any }) | null
  dispatches: (Dispatch & { equipment?: Equipment; supplier?: Supplier; [key: string]: any })[]
  equipment?: (Equipment & { supplier?: Supplier })[]
  suppliers?: Supplier[]
  clients?: Client[]
  onClose: () => void
  onSaved: () => void
}

function parseTimeSlot(slot: string | undefined | null): { start: string; end: string } {
  if (!slot) return { start: '', end: '' }
  const match = slot.match(/(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/)
  if (match) return { start: match[1], end: match[2] }
  return { start: '', end: '' }
}

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  return mins > 0 ? Math.round(mins / 60 * 10) / 10 : 0
}
// 24:00 → 다음날 00:00 처리용 (시간대 끝에서만 사용)

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', '']
  const hours = Array.from({ length: 25 }, (_, i) => String(i).padStart(2, '0')) // 00~24
  const s = 'border border-gray-300 rounded-lg text-sm bg-white py-2 px-1 focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
      <select value={h ?? ''} onChange={e => onChange(e.target.value ? e.target.value + ':' + (m || '00') : '')}
        style={{ flex: 1, minWidth: 0 }} className={s}>
        <option value="">시</option>
        {hours.map(hh => <option key={hh} value={hh}>{hh}</option>)}
      </select>
      <span style={{ color: '#9ca3af' }}>:</span>
      <select value={m ?? ''} onChange={e => onChange(e.target.value !== '' ? (h || '00') + ':' + e.target.value : '')}
        style={{ width: 64 }} className={s}>
        <option value="">분</option>
        <option value="00">00</option>
        <option value="30">30</option>
      </select>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

export default function LogModal({ log, dispatches, equipment = [], suppliers = [], clients = [], onClose, onSaved }: Props) {
  const isEdit = !!(log?.id)
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [workImageUrl, setWorkImageUrl] = useState<string>((log as any)?.work_image_url ?? '')
  const [workImagePreview, setWorkImagePreview] = useState<string | null>((log as any)?.work_image_url ?? null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const workImgRef = useRef<HTMLInputElement>(null)
  const _preDispInit = (() => {
    const did = (log as any)?.dispatch_id ?? log?.id ?? ''
    return did ? dispatches.find(d => d.id === did) : null
  })()
  const [equipMode, setEquipMode] = useState<'select' | 'text'>(_preDispInit?.equipment_id ? 'select' : 'text')
  const [equipDropOpen, setEquipDropOpen] = useState(false)
  const [equipDropIdx, setEquipDropIdx] = useState(-1)
  const [equipInfo, setEquipInfo] = useState<{ type: string; spec: string; model: string } | null>(null)
  const [supplierMode, setSupplierMode] = useState<'select' | 'text'>(
    (_preDispInit as any)?.supplier_text ? 'text' : 'select'
  )
  const [supplierText, setSupplierText] = useState((_preDispInit as any)?.supplier_text ?? '')
  // 작업명 직접입력 모드 (WORK_TYPES에 없는 값이면 직접입력 모드)
  const _stdTypes = ['버켓', '뿌레카', '집게', '운반', '기타']
  const _wt1 = (log as any)?.work_type_1 ?? ''
  const _wt2 = (log as any)?.work_type_2 ?? ''
  const _wt3 = (log as any)?.work_type_3 ?? ''
  const [directSlots, setDirectSlots] = useState<Set<number>>(() => {
    const s = new Set<number>()
    if (_wt1 && !_stdTypes.includes(_wt1)) s.add(1)
    if (_wt2 && !_stdTypes.includes(_wt2)) s.add(2)
    if (_wt3 && !_stdTypes.includes(_wt3)) s.add(3)
    return s
  })
  function toggleDirect(slot: number, on: boolean, resetVal?: string) {
    setDirectSlots(s => { const n = new Set(s); on ? n.add(slot) : n.delete(slot); return n })
    if (!on && resetVal !== undefined) setF(`work_type_${slot}` as any, resetVal)
  }

  // 차종 + 차량번호 분리 (equipment_text = "S/L 9773" 형태)
  function splitEquipText(text: string) {
    const parts = text.trim().split(/\s+/)
    if (parts.length >= 2) return { typeTxt: parts.slice(0, -1).join(' '), plate: parts[parts.length - 1] }
    return { typeTxt: '', plate: text }
  }
  const _initEquipRaw = (_preDispInit as any)?.equipment_text ?? (_preDispInit as any)?.equipment?.plate_no ?? ''
  const _initEquipParsed = splitEquipText(_initEquipRaw)
  const [equipTypeTxt, setEquipTypeTxt] = useState(_initEquipParsed.typeTxt)

  // 현장명 목록 (기존 배차에서 로드)
  const [siteOptions, setSiteOptions] = useState<string[]>([])
  useEffect(() => {
    supabase.from('dispatches').select('site_name').not('site_name', 'is', null).neq('site_name', '')
      .then(({ data }: { data: any[] | null }) => {
        const names = Array.from(new Set((data ?? []).map((r: any) => r.site_name).filter(Boolean))) as string[]
        setSiteOptions(names.sort())
      })
  }, [])

  // 이전작업복사
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyDate, setCopyDate] = useState('')
  const [copyClient, setCopyClient] = useState('')
  const [copyEquip, setCopyEquip] = useState('')
  const [copyResults, setCopyResults] = useState<any[]>([])
  const [copyLoading, setCopyLoading] = useState(false)

  async function searchCopy(equip?: string, client?: string, date?: string) {
    const eq = equip ?? copyEquip
    const cl = client ?? copyClient
    const dt = date ?? copyDate
    if (!eq && !cl && !dt) { setCopyResults([]); return }
    setCopyLoading(true)

    // daily_logs 기준으로 최근 log_date 순 조회 (배차 재사용 시에도 최신 날짜 반영)
    let logQuery = supabase.from('daily_logs')
      .select('dispatch_id, log_date, driver_name, work_time_1, work_time_2, work_time_3, work_type_1, work_type_2, work_type_3, work_price_1, work_price_2, work_price_3, dispatch:dispatches(*, equipment:equipment(type, plate_no, spec, model), supplier:suppliers(name, ceo_name))')
      .order('log_date', { ascending: false })
      .limit(500)

    if (dt) logQuery = logQuery.eq('log_date', dt)

    const { data: logRows } = await logQuery

    // dispatch_id 기준 중복 제거 (같은 배차의 가장 최근 log만 유지)
    const seen = new Set<string>()
    let results: any[] = []
    for (const row of (logRows ?? [])) {
      const d = row.dispatch as any
      if (!d || seen.has(d.id)) continue
      seen.add(d.id)
      results.push({
        ...d,
        _log_date: row.log_date,
        _log_driver_name: row.driver_name,
        _work_time_1: row.work_time_1,
        _work_time_2: row.work_time_2,
        _work_time_3: row.work_time_3,
        _work_type_1: row.work_type_1,
        _work_type_2: row.work_type_2,
        _work_type_3: row.work_type_3,
        _work_price_1: row.work_price_1,
        _work_price_2: row.work_price_2,
        _work_price_3: row.work_price_3,
      })
    }

    if (eq) {
      const norm = eq.replace(/\s/g, '')
      results = results.filter((r: any) => {
        const txt = (r.equipment_text ?? '').replace(/\s/g, '')
        const plate = (r.equipment?.plate_no ?? '').replace(/\s/g, '')
        return txt.includes(norm) || plate.includes(norm)
      })
    }
    if (cl) results = results.filter((r: any) => (r.client_name ?? '').includes(cl))

    setCopyResults(results.slice(0, 50))
    setCopyLoading(false)
  }

  function applyCopy(d: any) {
    const eq = d.equipment ?? {}
    const copiedEquipText = d.equipment_text ?? ''
    const copiedEquipParsed = splitEquipText(copiedEquipText)
    const copiedPlate = copiedEquipParsed.plate || eq.plate_no || ''
    const copiedType = copiedEquipParsed.typeTxt || equipmentTypeLabel(eq.type)
    setEquipMode('text')
    setEquipTypeTxt(copiedType)
    setEquipInfo({ type: eq.type ?? '', spec: eq.spec ?? '', model: eq.model ?? '' })
    setDispatch({
      id: '',
      client_name: d.client_name ?? '',
      site_name: d.site_name ?? '',
      equipment_id: '',
      equipment_text: copiedPlate,
      supplier_id: d.supplier_id ?? '',
      driver_name: d.driver_name ?? '',
      start_date: d.start_date ?? '',
      end_date: d.end_date ?? '',
      unit_type: d.unit_type ?? 'day',
      client_unit_price: d.client_unit_price ?? '',
      supplier_unit_price: d.supplier_unit_price ?? '',
      commission_amount: d.commission_amount ?? '',
      status: 'active',
      memo: d.memo ?? '',
    })
    // 이전 일보의 시간대/작업유형/단가도 복사
    const sl1 = parseTimeSlot(d._work_time_1)
    const sl2 = parseTimeSlot(d._work_time_2)
    const sl3 = parseTimeSlot(d._work_time_3)
    setForm(f => ({
      ...f,
      use_slot1: true,
      time1_start: sl1.start || f.time1_start,
      time1_end: sl1.end || f.time1_end,
      work_type_1: d._work_type_1 || f.work_type_1,
      work_price_1: d._work_price_1 ? String(d._work_price_1) : f.work_price_1,
      use_slot2: !!(d._work_time_2),
      time2_start: sl2.start || f.time2_start,
      time2_end: sl2.end || f.time2_end,
      work_type_2: d._work_type_2 || f.work_type_2,
      work_price_2: d._work_price_2 ? String(d._work_price_2) : f.work_price_2,
      use_slot3: !!(d._work_time_3),
      time3_start: sl3.start || f.time3_start,
      time3_end: sl3.end || f.time3_end,
      work_type_3: d._work_type_3 || f.work_type_3,
      work_price_3: d._work_price_3 ? String(d._work_price_3) : f.work_price_3,
      driver_name: d._log_driver_name || f.driver_name,
    }))
    setCopyOpen(false)
  }

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])

  const dispId = (log as any)?.dispatch_id ?? log?.id ?? ''
  const preDispatch = dispId
    ? dispatches.find(d => d.id === dispId)
    : null
  const isNewDispatchDraft = !isEdit && !preDispatch

  const slot1 = parseTimeSlot(log?.work_time_1)
  const slot2 = parseTimeSlot(log?.work_time_2)
  const slot3 = parseTimeSlot((log as any)?.work_time_3)

  const [clientMode, setClientMode] = useState<'search' | 'text'>('search')

  const [dispatch, setDispatch] = useState({
    id: preDispatch?.id ?? dispId ?? '',
    client_name: (preDispatch as any)?.client_name ?? '',
    site_name: (preDispatch as any)?.site_name ?? '',
    equipment_id: preDispatch?.equipment_id ?? '',
    equipment_text: _initEquipParsed.plate,
    supplier_id: preDispatch?.supplier_id ?? ((() => {
      const dn = (preDispatch as any)?.driver_name ?? ''
      return dn ? (suppliers.find(s => s.ceo_name && s.ceo_name.replace(/\s/g,'') === dn.replace(/\s/g,''))?.id ?? '') : ''
    })()),
    driver_name: (preDispatch as any)?.driver_name ?? '',
    start_date: preDispatch?.start_date ?? '',
    end_date: preDispatch?.end_date ?? '',
    unit_type: preDispatch?.unit_type ?? 'day',
    client_unit_price: preDispatch?.client_unit_price ?? '',
    supplier_unit_price: preDispatch?.supplier_unit_price ?? '',
    commission_amount: preDispatch?.commission_amount ?? '',
    status: preDispatch?.status ?? 'active',
    memo: preDispatch?.memo ?? '',
  })

  const WORK_TYPES = ['버켓', '뿌레카', '집게', '운반', '기타']

  const [form, setForm] = useState({
    log_date: log?.log_date ?? localDateStr(),
    quantity: log?.quantity ?? 0,
    note: log?.note ?? '',
    time1_start: slot1.start || '08:00',
    time1_end: slot1.end || '12:00',
    work_type_1: (log as any)?.work_type_1 ?? '버켓',
    work_price_1: (log as any)?.work_price_1 ?? (preDispatch?.client_unit_price ? String(preDispatch.client_unit_price) : ''),
    time2_start: slot2.start || '13:00',
    time2_end: slot2.end || '17:00',
    work_type_2: (log as any)?.work_type_2 ?? '버켓',
    // 슬롯2 단가: 저장값 → 같은 장치면 슬롯1 단가 → 배차 단가 순
    work_price_2: (() => { const p2 = (log as any)?.work_price_2; if (p2) return String(p2); const wt1 = (log as any)?.work_type_1 ?? '버켓'; const wt2 = (log as any)?.work_type_2 ?? '버켓'; const p1 = (log as any)?.work_price_1; if (wt2 && wt2 === wt1 && p1) return String(p1); return preDispatch?.client_unit_price ? String(preDispatch.client_unit_price) : '' })(),
    use_slot1: true,
    use_slot2: log ? !!(log?.work_time_2) : true,
    use_slot3: !!(_wt3 || (log as any)?.work_time_3),
    time3_start: slot3.start || '17:00',
    time3_end: slot3.end || '24:00',
    work_type_3: (log as any)?.work_type_3 ?? '버켓',
    // 슬롯3 단가: 저장값 → 같은 장치면 슬롯1/2 단가 순
    work_price_3: (() => { const p3 = (log as any)?.work_price_3; if (p3) return String(p3); const wt3 = (log as any)?.work_type_3 ?? '버켓'; const wt1 = (log as any)?.work_type_1 ?? '버켓'; const wt2 = (log as any)?.work_type_2 ?? '버켓'; const p1 = (log as any)?.work_price_1; const p2 = (log as any)?.work_price_2; if (wt3 && wt3 === wt1 && p1) return String(p1); if (wt3 && wt3 === wt2 && p2) return String(p2); return '' })(),
    work_content: log?.work_content ?? '',
    special_notes: log?.special_notes ?? '',
    driver_name: log?.driver_name ?? '',
  })

  const draftHydratedRef = useRef(false)
  const [draftRestored, setDraftRestored] = useState(false)

  function hasDraftContent(draftDispatch = dispatch, draftForm = form, draftEquipType = equipTypeTxt, draftSupplierText = supplierText) {
    return Boolean(
      draftDispatch.client_name ||
      draftDispatch.site_name ||
      draftDispatch.equipment_id ||
      draftDispatch.equipment_text ||
      draftDispatch.supplier_id ||
      draftDispatch.driver_name ||
      draftDispatch.end_date ||
      draftDispatch.client_unit_price ||
      draftDispatch.supplier_unit_price ||
      draftDispatch.commission_amount ||
      draftDispatch.memo ||
      draftEquipType ||
      equipmentTypeLabel(equipInfo?.type) ||
      draftSupplierText ||
      draftForm.note ||
      draftForm.quantity ||
      draftForm.work_content ||
      draftForm.special_notes ||
      draftForm.work_price_1 ||
      draftForm.work_price_2 ||
      draftForm.work_price_3 ||
      draftForm.use_slot3 ||
      draftForm.log_date !== localDateStr() ||
      draftForm.time1_start !== '08:00' ||
      draftForm.time1_end !== '12:00' ||
      draftForm.time2_start !== '13:00' ||
      draftForm.time2_end !== '17:00' ||
      draftForm.time3_start !== '17:00' ||
      draftForm.time3_end !== '24:00' ||
      workImageUrl
    )
  }

  useEffect(() => {
    if (!isNewDispatchDraft || draftHydratedRef.current) return
    draftHydratedRef.current = true
    try {
      const raw = window.localStorage.getItem(DISPATCH_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft?.dispatch) setDispatch(d => ({ ...d, ...draft.dispatch }))
      if (draft?.form) setForm(f => ({ ...f, ...draft.form }))
      if (typeof draft?.equipMode === 'string') setEquipMode(draft.equipMode)
      if (typeof draft?.clientMode === 'string') setClientMode(draft.clientMode)
      if (typeof draft?.supplierMode === 'string') setSupplierMode(draft.supplierMode)
      if (typeof draft?.equipTypeTxt === 'string') setEquipTypeTxt(draft.equipTypeTxt)
      if (typeof draft?.supplierText === 'string') setSupplierText(draft.supplierText)
      if (typeof draft?.workImageUrl === 'string') {
        setWorkImageUrl(draft.workImageUrl)
        setWorkImagePreview(draft.workImageUrl || null)
      }
      setDraftRestored(true)
    } catch {
      window.localStorage.removeItem(DISPATCH_DRAFT_KEY)
    }
  }, [isNewDispatchDraft])

  const effectiveEquipTypeTxt = equipTypeTxt || equipmentTypeLabel(equipInfo?.type)

  useEffect(() => {
    if (!isNewDispatchDraft || !draftHydratedRef.current) return
    const timer = window.setTimeout(() => {
      if (!hasDraftContent()) {
        window.localStorage.removeItem(DISPATCH_DRAFT_KEY)
        return
      }
      window.localStorage.setItem(DISPATCH_DRAFT_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        dispatch,
        form,
        equipMode,
        clientMode,
        supplierMode,
        equipTypeTxt: effectiveEquipTypeTxt,
        supplierText,
        workImageUrl,
      }))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [isNewDispatchDraft, dispatch, form, equipMode, clientMode, supplierMode, equipTypeTxt, supplierText, workImageUrl])

  function clearDraft() {
    window.localStorage.removeItem(DISPATCH_DRAFT_KEY)
    setDraftRestored(false)
  }

  function setD(field: string, value: string | number) {
    setDispatch(d => ({ ...d, [field]: value }))
  }
  function setF(field: string, value: string | number) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handleWorkPrice1Change(value: string) {
    setForm(f => {
      const next: any = { ...f, work_price_1: value }
      if (f.work_type_2 && f.work_type_2 === f.work_type_1 && (!f.work_price_2 || f.work_price_2 === f.work_price_1)) {
        next.work_price_2 = value
      }
      if (f.work_type_3 && f.work_type_3 === f.work_type_1 && (!f.work_price_3 || f.work_price_3 === f.work_price_1)) {
        next.work_price_3 = value
      }
      return next
    })
  }

  useEffect(() => {
    setForm(f => {
      if (!f.work_price_1 || !f.work_type_1) return f
      const next: any = {}
      if (f.work_type_2 === f.work_type_1 && !f.work_price_2) next.work_price_2 = f.work_price_1
      if (f.work_type_3 === f.work_type_1 && !f.work_price_3) next.work_price_3 = f.work_price_1
      return Object.keys(next).length ? { ...f, ...next } : f
    })
  }, [])

  function normalizePlate(value: string) {
    return value.replace(/\s/g, '').toLowerCase()
  }

  function findEquipmentByPlate(value: string) {
    const normalized = normalizePlate(value)
    if (normalized.length < 2) return null
    const exact = equipment.find(eq => normalizePlate(eq.plate_no ?? '') === normalized)
    if (exact) return exact
    const partial = equipment.filter(eq => normalizePlate(eq.plate_no ?? '').includes(normalized))
    return partial.length === 1 ? partial[0] : null
  }

  function applyMatchedEquipment(eq: Equipment & { supplier?: Supplier }, plateNo = eq.plate_no ?? '') {
    const sup = eq.supplier_id ? suppliers.find(s => s.id === eq.supplier_id) : undefined
    setEquipTypeTxt(equipmentTypeLabel((eq as any).type))
    setEquipInfo({ type: (eq as any).type ?? '', spec: (eq as any).spec ?? '', model: (eq as any).model ?? '' })
    setDispatch(d => ({
      ...d,
      equipment_text: plateNo,
      supplier_id: eq.supplier_id ?? d.supplier_id,
      driver_name: sup?.ceo_name ?? d.driver_name,
    }))
  }

  function handleEquipmentTextChange(value: string) {
    setDispatch(d => ({ ...d, equipment_text: value }))
    setEquipDropOpen(true)
    setEquipDropIdx(-1)
    const matched = findEquipmentByPlate(value)
    if (!matched) return
    const sup = matched.supplier_id ? suppliers.find(s => s.id === matched.supplier_id) : undefined
    setEquipTypeTxt(equipmentTypeLabel((matched as any).type))
    setEquipInfo({ type: (matched as any).type ?? '', spec: (matched as any).spec ?? '', model: (matched as any).model ?? '' })
    setDispatch(d => ({
      ...d,
      supplier_id: matched.supplier_id ?? d.supplier_id,
      driver_name: sup?.ceo_name ?? d.driver_name,
    }))
  }

  function handleEquipmentChange(equipmentId: string) {
    const eq = equipment.find(e => e.id === equipmentId)
    const sup = eq?.supplier_id ? suppliers.find(s => s.id === eq.supplier_id) : undefined
    if (eq) {
      setEquipTypeTxt(equipmentTypeLabel((eq as any).type))
      setEquipInfo({ type: (eq as any).type ?? '', spec: (eq as any).spec ?? '', model: (eq as any).model ?? '' })
    }
    setDispatch(d => ({
      ...d,
      equipment_id: equipmentId,
      supplier_id: eq?.supplier_id ?? d.supplier_id,
      driver_name: sup?.ceo_name ?? d.driver_name,
    }))
  }

  useEffect(() => {
    if (equipMode !== 'text' || !dispatch.equipment_text) return
    const matched = findEquipmentByPlate(dispatch.equipment_text)
    if (!matched) return
    setEquipTypeTxt(equipmentTypeLabel((matched as any).type))
    setEquipInfo({ type: (matched as any).type ?? '', spec: (matched as any).spec ?? '', model: (matched as any).model ?? '' })
  }, [equipment, equipMode])

  function handlePriceChange(field: 'client_unit_price' | 'commission_amount', value: string) {
    setDispatch(d => ({ ...d, [field]: value }))
  }

  function handleDriverNameChange(name: string) {
    const matched = suppliers.find(s => s.ceo_name && s.ceo_name.replace(/\s/g, '') === name.replace(/\s/g, ''))
    setDispatch(d => ({ ...d, driver_name: name, supplier_id: matched ? matched.id : d.supplier_id }))
  }

  const selectedSupplier = suppliers.find(s => s.id === dispatch.supplier_id)
  const matchedSupplier = dispatch.driver_name
    ? suppliers.find(s => s.ceo_name && s.ceo_name.replace(/\s/g, '') === dispatch.driver_name.replace(/\s/g, ''))
    : null

  async function handleSave() {
    setSaving(true)
    const dispatchPayload: any = {
      site_name: dispatch.site_name,
      client_name: dispatch.client_name || null,
      equipment_id: equipMode === 'select' ? (dispatch.equipment_id || null) : null,
      equipment_text: equipMode === 'text' ? ([effectiveEquipTypeTxt, dispatch.equipment_text].filter(Boolean).join(' ') || null) : null,
      supplier_id: supplierMode === 'select' ? (dispatch.supplier_id || null) : null,
      driver_name: dispatch.driver_name,
      start_date: form.log_date || dispatch.start_date || localDateStr(),
      end_date: dispatch.end_date || null,
      unit_type: dispatch.unit_type,
      client_unit_price: dispatch.client_unit_price ? Number(dispatch.client_unit_price) : null,
      supplier_unit_price: dispatch.supplier_unit_price ? Number(dispatch.supplier_unit_price) : null,
      status: dispatch.status,
      memo: dispatch.memo || null,
    }
    // 컬럼이 없을 수 있는 선택적 필드는 값 있을 때만 포함
    if (supplierMode === 'text' && supplierText) dispatchPayload.supplier_text = supplierText
    if (dispatch.commission_amount) dispatchPayload.commission_amount = Number(dispatch.commission_amount)

    const optionalDispCols = ['supplier_text', 'commission_amount', 'end_date', 'memo']
    async function stripAndSave(payload: any, id?: string): Promise<{ id: string | null; ok: boolean }> {
      const p = { ...payload }
      for (let i = 0; i <= optionalDispCols.length; i++) {
        if (id) {
          const { error } = await supabase.from('dispatches').update(p).eq('id', id)
          if (!error) return { id, ok: true }
          const badCol = optionalDispCols.find(c => error.message?.includes(c))
          if (badCol) { delete p[badCol]; continue }
          alert('배차 저장 오류: ' + error.message); return { id: null, ok: false }
        } else {
          const { data, error } = await supabase.from('dispatches').insert(p).select('id').single()
          if (!error) return { id: data.id, ok: true }
          const badCol = optionalDispCols.find(c => error.message?.includes(c))
          if (badCol) { delete p[badCol]; continue }
          alert('배차 저장 오류: ' + error.message); return { id: null, ok: false }
        }
      }
      return { id: null, ok: false }
    }
    const { id: savedDispId, ok: dispOk } = await stripAndSave(dispatchPayload, dispatch.id || undefined)
    if (!dispOk) { setSaving(false); return }
    const dispatchId = savedDispId!

    const work_time_1 = form.use_slot1 && form.time1_start && form.time1_end ? form.time1_start + ' ~ ' + form.time1_end : null
    const work_time_2 = form.use_slot2 && form.time2_start && form.time2_end ? form.time2_start + ' ~ ' + form.time2_end : null
    const work_time_3 = form.use_slot3 && form.time3_start && form.time3_end ? form.time3_start + ' ~ ' + form.time3_end : null

    const autoH = Math.round((
      (form.use_slot1 ? calcHours(form.time1_start, form.time1_end) : 0) +
      (form.use_slot2 ? calcHours(form.time2_start, form.time2_end) : 0) +
      (form.use_slot3 ? calcHours(form.time3_start, form.time3_end) : 0)
    ) * 10) / 10
    const finalQty = autoH || Number(form.quantity) || 0

    const supplierAmt = dispatch.supplier_unit_price ? Number(dispatch.supplier_unit_price) : null

    const logPayload = {
      dispatch_id: dispatchId,
      log_date: form.log_date,
      quantity: finalQty,
      note: form.note || null,
      work_time_1,
      work_time_2,
      work_time_3,
      // use_slot 체크된 경우에만 저장 (기본값 "버켓"이 의도치 않게 저장되는 방지)
      work_type_1: (form.use_slot1 && form.work_type_1) ? form.work_type_1 : null,
      work_type_2: (form.use_slot2 && form.work_type_2) ? form.work_type_2 : null,
      work_type_3: (form.use_slot3 && form.work_type_3) ? form.work_type_3 : null,
      work_price_1: (form.use_slot1 && form.work_price_1) ? Number(form.work_price_1) : null,
      work_price_2: (form.use_slot2 && form.work_price_2) ? Number(form.work_price_2) : null,
      work_price_3: (form.use_slot3 && form.work_price_3) ? Number(form.work_price_3) : null,
      work_content: form.work_content || null,
      special_notes: form.special_notes || null,
      driver_name: form.driver_name || null,
      engineer_daily_wage: supplierAmt,
      work_image_url: workImageUrl || null,
    }

    // 컬럼 없을 경우 해당 필드를 하나씩 제거하며 반복 재시도
    const optionalLogCols = [
      'work_type_1', 'work_time_1', 'work_price_1',
      'work_type_2', 'work_time_2', 'work_price_2',
      'work_type_3', 'work_time_3', 'work_price_3',
      'work_image_url', 'work_content', 'special_notes',
      'engineer_daily_wage', 'driver_name', 'note',
    ]
    async function saveLog(payload: any): Promise<boolean> {
      const p = { ...payload }
      for (let i = 0; i <= optionalLogCols.length; i++) {
        const { error } = isEdit
          ? await supabase.from('daily_logs').update(p).eq('id', log!.id)
          : await supabase.from('daily_logs').insert(p)
        if (!error) return true
        const badCol = optionalLogCols.find(c => error.message?.includes(c))
        if (badCol) { delete p[badCol]; continue }
        alert('저장 오류: ' + error.message); return false
      }
      return true
    }
    const ok = await saveLog(logPayload)
    setSaving(false)
    if (ok) {
      if (isNewDispatchDraft) clearDraft()
      onSaved()
    }
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '배차 수정' : '배차 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {draftRestored && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>임시저장된 배차 내용을 복원했습니다.</span>
              <button type="button" onClick={clearDraft} className="font-semibold text-amber-900 hover:underline">비우기</button>
            </div>
          )}

          <Row label="날짜">
            <input type="date" value={form.log_date}
              onChange={e => {
                // 날짜 변경 시 기존 슬롯 체크 상태 유지 (리셋 방지)
                const slot2 = form.use_slot2
                const slot3 = form.use_slot3
                setForm(f => ({ ...f, log_date: e.target.value, use_slot2: slot2, use_slot3: slot3 }))
              }}
              className={inp} />
          </Row>

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">배차 정보</p>
            <button type="button" onClick={() => setCopyOpen(v => !v)}
              className="text-xs px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 font-medium">
              📋 이전작업 복사
            </button>
          </div>

          {copyOpen && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <input type="date" value={copyDate} onChange={e => setCopyDate(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm flex-1 min-w-[120px]" placeholder="날짜" />
                <input type="text" value={copyClient} onChange={e => setCopyClient(e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm flex-1 min-w-[100px]" placeholder="업체명" />
                <input type="text" value={copyEquip}
                  onChange={e => { setCopyEquip(e.target.value); if (e.target.value.length >= 3) searchCopy(e.target.value) }}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm flex-1 min-w-[100px]" placeholder="번호 입력 (예: 6004)" />
                <button onClick={() => searchCopy()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                  조회
                </button>
              </div>
              {copyLoading && <p className="text-xs text-gray-400 text-center py-2">검색 중...</p>}
              {!copyLoading && copyResults.length === 0 && copyDate + copyClient + copyEquip !== '' && (
                <p className="text-xs text-gray-400 text-center py-2">결과 없음</p>
              )}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {copyResults.map(d => {
                  const eq = d.equipment
                  const equipLabel = d.equipment_text ?? (eq ? `${eq.plate_no ?? ''} ${eq.spec ?? ''}` : '')
                  return (
                    <button key={d.id} onClick={() => applyCopy(d)}
                      className="w-full text-left px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{d.client_name ?? '-'} · {d.site_name ?? '-'}</span>
                        <span className="text-xs text-gray-400 shrink-0">{d._log_date ?? d.start_date ?? ''}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{equipLabel} · {d.driver_name ?? ''} · {d.unit_type === 'hour' ? '시간' : '일'}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <Row label="발주처">
            <div className="flex gap-1 mb-2 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setClientMode('search')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${clientMode === 'search' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                검색
              </button>
              <button type="button" onClick={() => setClientMode('text')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${clientMode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                직접입력
              </button>
            </div>
            {clientMode === 'search' ? (
              <>
                <input
                  list="client-list-modal"
                  value={dispatch.client_name}
                  onChange={e => setD('client_name', e.target.value)}
                  className={inp} placeholder="발주처 검색..."
                />
                <datalist id="client-list-modal">
                  {clients.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </>
            ) : (
              <input value={dispatch.client_name} onChange={e => setD('client_name', e.target.value)}
                className={inp} placeholder="발주처 직접 입력" />
            )}
          </Row>


          <Row label="현장">
            <input list="site-name-list" value={dispatch.site_name} onChange={e => setD('site_name', e.target.value)}
              className={inp} placeholder="현장명 검색..." />
            <datalist id="site-name-list">
              {siteOptions.map(s => <option key={s} value={s} />)}
            </datalist>
          </Row>

          <Row label="장비">
            {equipInfo && (equipInfo.spec || equipInfo.model || equipInfo.type) && (
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                {equipInfo.type && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                    {equipInfo.type === 'excavator' ? '굴삭기' : equipInfo.type === 'dump' ? '덤프' : (equipInfo.type === 'cargo' || equipInfo.type === 'truck') ? '화물' : equipInfo.type}
                  </span>
                )}
                {equipInfo.spec && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{equipInfo.spec}</span>
                )}
                {equipInfo.model && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{equipInfo.model}</span>
                )}
              </div>
            )}
            <div className="flex gap-2 mb-1.5">
              <input value={effectiveEquipTypeTxt}
                onChange={e => setEquipTypeTxt(e.target.value)}
                className="w-20 shrink-0 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="차종" />
              <div className="relative flex-1">
              <input value={dispatch.equipment_text ?? ''}
                onChange={e => handleEquipmentTextChange(e.target.value)}
                onFocus={() => setEquipDropOpen(true)}
                onBlur={() => setTimeout(() => { setEquipDropOpen(false); setEquipDropIdx(-1) }, 150)}
                onKeyDown={e => {
                  const val = (dispatch.equipment_text ?? '').replace(/\s/g, '')
                  const matches = equipment.filter(eq => (eq.plate_no ?? '').replace(/\s/g, '').includes(val))
                  if (!equipDropOpen || matches.length === 0) return
                  if (e.key === 'ArrowDown') { e.preventDefault(); setEquipDropIdx(i => Math.min(i + 1, matches.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setEquipDropIdx(i => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter' && equipDropIdx >= 0) {
                    e.preventDefault()
                    const eq = matches[equipDropIdx]
                    const sup = eq.supplier_id ? suppliers.find(s => s.id === eq.supplier_id) : undefined
                    applyMatchedEquipment(eq)
                    setEquipDropOpen(false); setEquipDropIdx(-1)
                  } else if (e.key === 'Escape') { setEquipDropOpen(false); setEquipDropIdx(-1) }
                }}
                className={inp} placeholder="차량번호 (예: 9773)" autoComplete="off" />
              {equipDropOpen && (() => {
                const val = (dispatch.equipment_text ?? '').replace(/\s/g, '')
                if (val.length < 2) return null
                const matches = equipment.filter(eq => (eq.plate_no ?? '').replace(/\s/g, '').includes(val))
                if (matches.length === 0) return null
                return (
                  <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {matches.map((eq, idx) => {
                      const sup = eq.supplier_id ? suppliers.find(s => s.id === eq.supplier_id) : undefined
                      return (
                        <button key={eq.id} type="button"
                          onMouseDown={e => {
                            e.preventDefault()
                            applyMatchedEquipment(eq)
                            setEquipDropOpen(false); setEquipDropIdx(-1)
                          }}
                          onMouseEnter={() => setEquipDropIdx(idx)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${idx === equipDropIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-800">{eq.plate_no}</span>
                            {((eq as any).spec || (eq as any).model) && (
                              <span className="text-xs text-blue-600">{(eq as any).spec ?? ''}{(eq as any).model ? ` · ${(eq as any).model}` : ''}</span>
                            )}
                          </div>
                          {sup && <span className="text-xs text-gray-500">{sup.name}{sup.ceo_name ? ` · ${sup.ceo_name}` : ''}</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
              </div>
            </div>
          </Row>

          <Row label="중기업체">
            <div className="flex gap-1 mb-1.5 bg-gray-100 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setSupplierMode('select')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${supplierMode === 'select' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>검색</button>
              <button type="button" onClick={() => setSupplierMode('text')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${supplierMode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>직접입력</button>
            </div>
            {supplierMode === 'select' ? (
              <select value={dispatch.supplier_id} onChange={e => setD('supplier_id', e.target.value)} className={inp}>
                <option value="">선택</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.ceo_name ? ` (${s.ceo_name})` : ''}</option>)}
              </select>
            ) : (
              <input value={supplierText} onChange={e => setSupplierText(e.target.value)}
                className={inp} placeholder="중기업체명 직접 입력" />
            )}
          </Row>

          <Row label="차주명">
            <input list="driver-names-log" value={dispatch.driver_name}
              onChange={e => handleDriverNameChange(e.target.value)}
              className={inp} placeholder="차주 이름" />
            <datalist id="driver-names-log">
              {suppliers.filter(s => s.ceo_name).map(s => (
                <option key={s.id} value={s.ceo_name!}>{s.name}</option>
              ))}
            </datalist>
            {dispatch.driver_name && matchedSupplier && (
              <p className="text-xs text-blue-500 mt-1">{matchedSupplier.name} 자동 연결</p>
            )}
          </Row>

          {/* 시간대 1 */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1 cursor-pointer">
              <input type="checkbox" checked={form.use_slot1} onChange={e => setF('use_slot1', e.target.checked as any)}
                className="w-3.5 h-3.5 rounded" />
              시간대 1
            </label>
            <div className={`space-y-1.5 ${!form.use_slot1 ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-1.5">
                {directSlots.has(1) ? (
                  <div className="flex items-center gap-0.5 w-[88px] shrink-0">
                    <input autoFocus value={form.work_type_1} onChange={e => setF('work_type_1', e.target.value)}
                      className="flex-1 min-w-0 px-1 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none" placeholder="작업명" />
                    <button type="button" onClick={() => toggleDirect(1, false, '버켓')} className="text-gray-400 hover:text-gray-600 text-base px-0.5 leading-none">↩</button>
                  </div>
                ) : (
                  <select value={form.work_type_1} onChange={e => {
                    if (e.target.value === '__direct__') { toggleDirect(1, true); setF('work_type_1', '') }
                    else setF('work_type_1', e.target.value)
                  }} className="w-[88px] shrink-0 px-1 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">작업명</option>
                    {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="__direct__">직접입력</option>
                  </select>
                )}
                <TimeSelect value={form.time1_start} onChange={v => setF('time1_start', v)} />
                <span className="text-gray-400 text-sm shrink-0">~</span>
                <TimeSelect value={form.time1_end} onChange={v => setF('time1_end', v)} />
              </div>
              {form.work_type_1 && (
                <div className="flex items-center gap-1.5 pl-[88px]">
                  <div className="relative flex-1">
                    <input type="number" value={form.work_price_1}
                      onChange={e => handleWorkPrice1Change(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      placeholder="개별단가" />
                    <span className="absolute right-2 top-1.5 text-xs text-gray-400">원</span>
                  </div>
                  {form.work_price_1 && calcHours(form.time1_start, form.time1_end) > 0 && (
                    <span className="text-xs text-blue-600 shrink-0 font-medium">
                      = {(calcHours(form.time1_start, form.time1_end) * Number(form.work_price_1)).toLocaleString()}원
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 시간대 2 */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1 cursor-pointer">
              <input type="checkbox" checked={form.use_slot2} onChange={e => setF('use_slot2', e.target.checked as any)}
                className="w-3.5 h-3.5 rounded" />
              시간대 2
            </label>
            <div className={`space-y-1.5 ${!form.use_slot2 ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-1.5">
                {directSlots.has(2) ? (
                  <div className="flex items-center gap-0.5 w-[88px] shrink-0">
                    <input autoFocus value={form.work_type_2} onChange={e => setF('work_type_2', e.target.value)}
                      className="flex-1 min-w-0 px-1 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none" placeholder="작업명" />
                    <button type="button" onClick={() => toggleDirect(2, false, '버켓')} className="text-gray-400 hover:text-gray-600 text-base px-0.5 leading-none">↩</button>
                  </div>
                ) : (
                  <select value={form.work_type_2} onChange={e => {
                    const t = e.target.value
                    if (t === '__direct__') { toggleDirect(2, true); setF('work_type_2', '') }
                    else setForm(f => { const u: any = { work_type_2: t }; if (t && t === f.work_type_1 && f.work_price_1) u.work_price_2 = f.work_price_1; return { ...f, ...u } })
                  }} className="w-[88px] shrink-0 px-1 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">작업명</option>
                    {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="__direct__">직접입력</option>
                  </select>
                )}
                <TimeSelect value={form.time2_start} onChange={v => setF('time2_start', v)} />
                <span className="text-gray-400 text-sm shrink-0">~</span>
                <TimeSelect value={form.time2_end} onChange={v => setF('time2_end', v)} />
              </div>
              {form.work_type_2 && (
                <div className="flex items-center gap-1.5 pl-[88px]">
                  <div className="relative flex-1">
                    <input type="number" value={form.work_price_2}
                      onChange={e => setF('work_price_2', e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      placeholder="개별단가" />
                    <span className="absolute right-2 top-1.5 text-xs text-gray-400">원</span>
                  </div>
                  {form.work_price_2 && calcHours(form.time2_start, form.time2_end) > 0 && (
                    <span className="text-xs text-blue-600 shrink-0 font-medium">
                      = {(calcHours(form.time2_start, form.time2_end) * Number(form.work_price_2)).toLocaleString()}원
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 시간대 3 */}
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-1 cursor-pointer">
              <input type="checkbox" checked={form.use_slot3} onChange={e => setF('use_slot3', e.target.checked as any)}
                className="w-3.5 h-3.5 rounded" />
              시간대 3
            </label>
            <div className={`space-y-1.5 ${!form.use_slot3 ? 'opacity-40 pointer-events-none' : ''}`}>
              <div className="flex items-center gap-1.5">
                {directSlots.has(3) ? (
                  <div className="flex items-center gap-0.5 w-[88px] shrink-0">
                    <input autoFocus value={form.work_type_3} onChange={e => setF('work_type_3', e.target.value)}
                      className="flex-1 min-w-0 px-1 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none" placeholder="작업명" />
                    <button type="button" onClick={() => toggleDirect(3, false, '버켓')} className="text-gray-400 hover:text-gray-600 text-base px-0.5 leading-none">↩</button>
                  </div>
                ) : (
                  <select value={form.work_type_3} onChange={e => {
                    const t = e.target.value
                    if (t === '__direct__') { toggleDirect(3, true); setF('work_type_3', '') }
                    else setForm(f => { const u: any = { work_type_3: t }; if (t && t === f.work_type_1 && f.work_price_1) u.work_price_3 = f.work_price_1; else if (t && t === f.work_type_2 && f.work_price_2) u.work_price_3 = f.work_price_2; return { ...f, ...u } })
                  }} className="w-[88px] shrink-0 px-1 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">작업명</option>
                    {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value="__direct__">직접입력</option>
                  </select>
                )}
                <TimeSelect value={form.time3_start} onChange={v => setF('time3_start', v)} />
                <span className="text-gray-400 text-sm shrink-0">~</span>
                <TimeSelect value={form.time3_end} onChange={v => setF('time3_end', v)} />
              </div>
              {form.work_type_3 && (
                <div className="flex items-center gap-1.5 pl-[88px]">
                  <div className="relative flex-1">
                    <input type="number" value={form.work_price_3}
                      onChange={e => setF('work_price_3', e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      placeholder="개별단가" />
                    <span className="absolute right-2 top-1.5 text-xs text-gray-400">원</span>
                  </div>
                  {form.work_price_3 && calcHours(form.time3_start, form.time3_end) > 0 && (
                    <span className="text-xs text-blue-600 shrink-0 font-medium">
                      = {(calcHours(form.time3_start, form.time3_end) * Number(form.work_price_3)).toLocaleString()}원
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {(() => {
            const h1 = form.use_slot1 ? calcHours(form.time1_start, form.time1_end) : 0
            const h2 = form.use_slot2 ? calcHours(form.time2_start, form.time2_end) : 0
            const h3 = form.use_slot3 ? calcHours(form.time3_start, form.time3_end) : 0
            const total = Math.round((h1 + h2 + h3) * 10) / 10
            const useWorkPrice = form.work_type_1 || form.work_type_2 || form.work_type_3
            const workTotal = (h1 * (Number(form.work_price_1) || 0)) + (h2 * (Number(form.work_price_2) || 0)) + (h3 * (Number(form.work_price_3) || 0))
            return total > 0 ? (
              <div className="text-xs text-blue-600 font-medium text-right -mt-2 space-y-0.5">
                <div>총 가동시간: {total}시간</div>
                {useWorkPrice && workTotal > 0 && <div>작업 합계: {workTotal.toLocaleString()}원</div>}
              </div>
            ) : null
          })()}

          {!((form.use_slot1 && form.work_type_1) || (form.use_slot2 && form.work_type_2) || (form.use_slot3 && form.work_type_3)) && (<>
            <Row label="단위">
              <div className="flex gap-2">
                {(['hour', 'day'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setD('unit_type', t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      dispatch.unit_type === t ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {t === 'hour' ? '시간' : '일'}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="단가">
              <div className="relative">
                <input type="number" value={dispatch.client_unit_price}
                  onChange={e => handlePriceChange('client_unit_price', e.target.value)}
                  className={inp} placeholder="발주처 청구단가" />
                <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
              </div>
            </Row>

            <Row label="수수료">
              <div className="relative">
                <input type="number" value={dispatch.commission_amount}
                  onChange={e => handlePriceChange('commission_amount', e.target.value)}
                  className={inp} placeholder="수수료" />
                <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
              </div>
            </Row>

            {(() => {
              const h1 = form.use_slot1 ? calcHours(form.time1_start, form.time1_end) : 0
              const h2 = form.use_slot2 ? calcHours(form.time2_start, form.time2_end) : 0
              const h3 = form.use_slot3 ? calcHours(form.time3_start, form.time3_end) : 0
              const p1 = form.use_slot1 && form.work_price_1 ? Number(form.work_price_1) : 0
              const p2 = form.use_slot2 && form.work_price_2 ? Number(form.work_price_2) : 0
              const p3 = form.use_slot3 && form.work_price_3 ? Number(form.work_price_3) : 0
              const slotAmt = Math.round(h1 * p1 + h2 * p2 + h3 * p3)
              const totalH = Math.round((h1 + h2 + h3) * 10) / 10
              const unitP = Number(dispatch.client_unit_price) || 0
              const qty = Number(form.quantity) || totalH || 0
              const supplyAmt = slotAmt > 0 ? slotAmt : (qty && unitP ? Math.round(qty * unitP) : 0)
              const hint = slotAmt > 0
                ? [p1 && `${h1}h×${p1.toLocaleString()}`, p2 && `${h2}h×${p2.toLocaleString()}`, p3 && `${h3}h×${p3.toLocaleString()}`].filter(Boolean).join(' + ')
                : (qty && unitP ? `${qty}시간 × ${unitP.toLocaleString()}` : '')
              return (
                <Row label="공급가액">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-bold text-blue-700">
                      {supplyAmt > 0 ? supplyAmt.toLocaleString() : '—'} 원
                    </div>
                    {supplyAmt > 0 && <span className="text-xs text-gray-400 shrink-0">{hint}</span>}
                  </div>
                </Row>
              )
            })()}
          </>)}

          <Row label="기사급여">
            <div className="relative">
              <input type="number" value={dispatch.supplier_unit_price}
                onChange={e => setD('supplier_unit_price', e.target.value)}
                className={inp} placeholder="기사 지급 급여" />
              <span className="absolute right-3 top-2 text-sm text-gray-400">원</span>
            </div>
          </Row>

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">일보 정보</p>

          <Row label="운전자 이름">
            <input value={form.driver_name} onChange={e => setF('driver_name', e.target.value)}
              className={inp} placeholder="운전자 이름 (차주와 다를 경우)" />
          </Row>


          <Row label="작업내용">
            <textarea value={form.work_content}
              onChange={e => setF('work_content', e.target.value)}
              className={inp + ' resize-none'} rows={2} placeholder="작업내용" />
          </Row>

          <Row label="특이사항">
            <textarea value={form.special_notes}
              onChange={e => setF('special_notes', e.target.value)}
              className={inp + ' resize-none'} rows={2} placeholder="특이사항" />
          </Row>

          <Row label="메모">
            <input value={dispatch.memo} onChange={e => setD('memo', e.target.value)}
              className={inp} placeholder="메모" />
          </Row>

          {/* 작업확인서 사진 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">작업확인서 사진</p>
            <input ref={workImgRef} type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0]; if (!file) return
              const reader = new FileReader()
              reader.onload = ev => setWorkImagePreview(ev.target?.result as string)
              reader.readAsDataURL(file)
              setUploading(true)
              try {
                const ext = file.name.split('.').pop() ?? 'jpg'
                const fileName = `daily-logs/${Date.now()}.${ext}`
                const { error } = await supabase.storage.from('documents').upload(fileName, file, { upsert: true })
                if (error) { alert('업로드 실패: ' + error.message); return }
                const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(fileName)
                setWorkImageUrl(publicUrl)
              } finally { setUploading(false) }
            }} />
            {lightboxOpen && workImagePreview && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4" onClick={() => setLightboxOpen(false)}>
                <img src={workImagePreview} alt="작업확인서 원본" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
                <button onClick={() => setLightboxOpen(false)} className="absolute top-4 right-4 text-white text-3xl leading-none">✕</button>
              </div>
            )}
            {workImagePreview ? (
              <div className="relative">
                <img src={workImagePreview} alt="작업확인서" onClick={() => setLightboxOpen(true)}
                  className="w-full rounded-xl border border-gray-200 object-contain max-h-64 bg-gray-50 cursor-zoom-in" />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button onClick={() => workImgRef.current?.click()}
                    className="bg-white/90 text-gray-700 text-xs font-medium px-2 py-1 rounded-lg shadow border border-gray-200">변경</button>
                  <button onClick={() => { setWorkImageUrl(''); setWorkImagePreview(null) }}
                    className="bg-white/90 text-red-500 text-xs font-medium px-2 py-1 rounded-lg shadow border border-gray-200">삭제</button>
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                    <span className="text-sm text-gray-500">업로드 중...</span>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => workImgRef.current?.click()} disabled={uploading}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-blue-300 hover:bg-blue-50/30 transition-colors disabled:opacity-50">
                <span className="text-2xl">📷</span>
                <span className="text-sm text-gray-400">{uploading ? '업로드 중...' : '사진 등록 (탭하여 선택)'}</span>
              </button>
            )}
          </div>

        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            취소
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? '저장 중...' : isEdit ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
