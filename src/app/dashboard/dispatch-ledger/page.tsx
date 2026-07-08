'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LedgerExcelUploadModal from './LedgerExcelUploadModal'
import DispatchModal from '../dispatches/DispatchModal'
import LogModal from '../daily-logs/LogModal'

interface LedgerRow {
  id: string; dispatch_id: string; log_date: string; equipment_type: string
  plate_no: string; work_device: string; operating_hours: number; unit_price: number
  sales_amount: number; driver_name: string; client_name: string; site_name: string
  unpaid_amount: number; engineer_name: string; engineer_daily_wage: number; is_paid: boolean
  commission_amount?: number
  work_type_1?: string; work_time_1?: string; work_price_1?: number
  work_type_2?: string; work_time_2?: string; work_price_2?: number
  memo?: string; invoice_issued?: boolean; invoice_image_url?: string
}
interface EquipOpt { id: string; plate_no: string; supplier_id: string | null; ownership: string; supplier_name?: string }
interface UnmatchedDispatch { id: string; log_date: string; client_name: string | null; equipment_text: string | null; driver_name: string | null; site_name: string | null; _displayName?: string }
type SortKey = keyof LedgerRow | 'unpaid_calc' | 'days_count' | 'invoice_status'

const td = 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap'
const tdr = 'px-3 py-2 text-sm text-gray-700 whitespace-nowrap text-right'
export default function DispatchLedgerPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const [dateFrom, setDateFrom] = useState(today.slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(today)
  const [wages, setWages] = useState<Record<string, number>>({})
  const [paid, setPaid] = useState<Record<string, boolean>>({})
  const [invoiced, setInvoiced] = useState<Record<string, boolean>>({})
  const [invoiceImages, setInvoiceImages] = useState<Record<string, string>>({})
  const [viewingInvoice, setViewingInvoice] = useState<string | null>(null)
  const [excelOpen, setExcelOpen] = useState(false)
  const [editDispatch, setEditDispatch] = useState<LedgerRow | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('log_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [clientOptions, setClientOptions] = useState<string[]>([])
  const [equipOptions, setEquipOptions] = useState<EquipOpt[]>([])
  const [editingDriver, setEditingDriver] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [bulkDriver, setBulkDriver] = useState('')
  const [bulkOwner, setBulkOwner] = useState('')
  const [bulkPlate, setBulkPlate] = useState('')
  const [bulkClientName, setBulkClientName] = useState('')
  const [clientDropOpen, setClientDropOpen] = useState(false)
  const [clientDropIdx, setClientDropIdx] = useState(-1)
  const [bulkWage, setBulkWage] = useState('')
  const [bulkCommission, setBulkCommission] = useState('')
  const [commissions, setCommissions] = useState<Record<string, number>>({})
  const [fullEquipment, setFullEquipment] = useState<any[]>([])
  const [allSuppliers, setAllSuppliers] = useState<any[]>([])
  const [allClients, setAllClients] = useState<any[]>([])
  const [logModalData, setLogModalData] = useState<{ log: any; dispatches: any[] } | null>(null)
  const [newDispatchOpen, setNewDispatchOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportVisible, setExportVisible] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const exportPrintRef = useRef<HTMLDivElement>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<LedgerRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [clientMergeOpen, setClientMergeOpen] = useState(false)
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [mergeTarget, setMergeTarget] = useState('')
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeSaving, setMergeSaving] = useState(false)
  const [view, setView] = useState<'ledger' | 'match'>('ledger')
  const [matchType, setMatchType] = useState<'client' | 'plate'>('client')
  const [matchLoading, setMatchLoading] = useState(false)
  const [unmatchedClients, setUnmatchedClients] = useState<UnmatchedDispatch[]>([])
  const [unmatchedPlates, setUnmatchedPlates] = useState<UnmatchedDispatch[]>([])
  const [selectedItem, setSelectedItem] = useState<UnmatchedDispatch | null>(null)
  const [matchSearch, setMatchSearch] = useState('')
  const [matchSaving, setMatchSaving] = useState(false)
  const [allInvNames, setAllInvNames] = useState<string[]>([])

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  useEffect(() => {
    Promise.all([
      supabase.from('invoices').select('client_name'),
      supabase.from('dispatches').select('client_name').not('client_name', 'is', null).neq('client_name', ''),
      supabase.from('clients').select('*'),
    ]).then(([inv, dis, cli]) => {
      const clientTableNames = (cli.data ?? []).map((c: any) => c.name).filter(Boolean)
      const names = [...new Set([
        ...clientTableNames,
        ...(inv.data ?? []).map((r: any) => r.client_name),
        ...(dis.data ?? []).map((r: any) => r.client_name),
      ].filter(Boolean))] as string[]
      setClientOptions(names.sort())
      setAllInvNames(names.sort())
      setAllClients(cli.data ?? [])
    })
    supabase.from('equipment').select('*, supplier:suppliers(*)').then(({ data }: { data: any[] | null }) => {
      const opts = (data ?? []).filter((e: any) => e.plate_no).map((e: any) => ({
        id: e.id, plate_no: e.plate_no, supplier_id: e.supplier_id,
        ownership: e.ownership ?? 'other', supplier_name: e.supplier?.name ?? '',
      }))
      setEquipOptions(opts)
      setFullEquipment(data ?? [])
    })
    supabase.from('suppliers').select('*').then(({ data }: { data: any[] | null }) => setAllSuppliers(data ?? []))
  }, [])

  function normCo(s: string) {
    return s.replace(/\(주\)/g, '').replace(/주식회사/g, '').replace(/유한회사/g, '')
      .replace(/\(유\)/g, '').replace(/\(합\)/g, '').replace(/협동조합/g, '')
      .replace(/\s+/g, '').toLowerCase()
  }

  async function loadMatchData() {
    setMatchLoading(true)
    const { data: invData } = await supabase.from('invoices').select('client_name')
    const { data: supplierData } = await supabase.from('suppliers').select('name')
    const rawNames: string[] = [
      ...(invData ?? []).map((r: any) => r.client_name),
      ...(supplierData ?? []).map((r: any) => r.name),
    ].filter(Boolean)
    const uniqNames = Array.from(new Set(rawNames)) as string[]
    setAllInvNames(uniqNames.sort())
    const normSet = new Set(uniqNames.map(n => normCo(n)))

    const { data: allDisps } = await supabase.from('dispatches')
      .select('id, log_date, client_name, equipment_text, driver_name, site_name, equipment_id, suppliers(name)')
    const clients: UnmatchedDispatch[] = []
    const plates: UnmatchedDispatch[] = []
    for (const d of (allDisps ?? [])) {
      const supplierName = (d.suppliers as any)?.name ?? ''
      const candidate = d.client_name?.trim() || supplierName
      const norm = candidate ? normCo(candidate) : ''
      const matched = norm && (normSet.has(norm) || uniqNames.some(n => { const nn = normCo(n); return nn && (nn.includes(norm) || norm.includes(nn)) }))
      if (!matched) {
        clients.push({ id: d.id, log_date: d.log_date, client_name: d.client_name, equipment_text: d.equipment_text, driver_name: d.driver_name, site_name: d.site_name, _displayName: candidate || '' })
      }
      if (!d.equipment_id && (d.equipment_text ?? '').trim()) {
        plates.push({ id: d.id, log_date: d.log_date, client_name: d.client_name, equipment_text: d.equipment_text, driver_name: d.driver_name, site_name: d.site_name })
      }
    }
    const uniqClients = Array.from(new Map(clients.map(c => [c._displayName || c.id, c])).values())
    setUnmatchedClients(uniqClients)
    setUnmatchedPlates(plates)
    setMatchLoading(false)
  }

  function openMatchView(type: 'client' | 'plate') {
    setMatchType(type); setView('match'); setSelectedItem(null); setMatchSearch('')
    loadMatchData()
  }

  async function saveClientMatch(dispatchId: string, clientName: string) {
    setMatchSaving(true)
    const item = selectedItem
    const displayName = item?._displayName || item?.client_name
    if (displayName) {
      const sameIds = unmatchedClients.filter(r => (r._displayName || r.client_name) === displayName).map(r => r.id)
      for (const id of sameIds) await supabase.from('dispatches').update({ client_name: clientName }).eq('id', id)
      setUnmatchedClients(prev => prev.filter(r => (r._displayName || r.client_name) !== displayName))
    } else {
      await supabase.from('dispatches').update({ client_name: clientName }).eq('id', dispatchId)
      setUnmatchedClients(prev => prev.filter(r => r.id !== dispatchId))
    }
    setSelectedItem(null); setMatchSearch(''); setMatchSaving(false)
  }

  async function savePlateMatch(dispatchId: string, eq: EquipOpt) {
    setMatchSaving(true)
    await supabase.from('dispatches').update({ equipment_id: eq.id, supplier_id: eq.supplier_id, equipment_text: null }).eq('id', dispatchId)
    setUnmatchedPlates(prev => prev.filter(r => r.id !== dispatchId))
    setSelectedItem(null); setMatchSearch(''); setMatchSaving(false)
  }

  async function saveDriverName(logId: string, dispatchId: string, value: string) {
    setRows(rows => rows.map(r => r.id === logId ? { ...r, engineer_name: value } : r))
    // 운전자명은 daily_logs만 업데이트 (차주명 = dispatches.driver_name은 건드리지 않음)
    await supabase.from('daily_logs').update({ driver_name: value }).eq('id', logId)
    setEditingDriver(null)
  }

  async function load() {
    setLoading(true)
    // dispatches + daily_logs를 JOIN으로 한 번에 조회
    let dispQuery = supabase.from('dispatches')
      .select('*, equipment:equipment(type, plate_no, spec, model, ownership), supplier:suppliers(name), daily_logs(*)')
      .order('start_date', { ascending: false })
    if (dateFrom) dispQuery = dispQuery.gte('start_date', dateFrom)
    if (dateTo) dispQuery = dispQuery.lte('start_date', dateTo)
    const [{ data: dispData, error: dispErr }, { data: equipAll }] = await Promise.all([
      dispQuery,
      supabase.from('equipment').select('type, plate_no, spec, model'),
    ])
    if (dispErr) { console.error(dispErr); setLoading(false); return }
    const equipByPlate = new Map((equipAll ?? []).map((e: any) => [e.plate_no, e]))

    const typeMap: Record<string, string> = { excavator: '굴삭기', dump: '덤프', cargo: '화물', truck: '화물' }
    const mapped: LedgerRow[] = (dispData ?? []).map((d: any) => {
      const joinedEq = d.equipment ?? {}
      // equipment_text로 입력된 경우 plate로 장비 정보 보완 (차종+차량번호 형태면 마지막 단어가 plate)
      const equipTextParts = (d.equipment_text ?? '').trim().split(/\s+/)
      const equipTextPlate = equipTextParts[equipTextParts.length - 1] ?? ''
      const equipTypeLbl = equipTextParts.length >= 2 ? equipTextParts.slice(0, -1).join(' ') : ''
      const textEq = (!d.equipment_id && d.equipment_text) ? (equipByPlate.get(equipTextPlate) ?? {}) : {}
      const eq = Object.keys(joinedEq).length > 0 ? joinedEq : textEq
      const log = (d.daily_logs ?? [])[0] ?? null
      const qty = log?.quantity ?? 0
      const unitPrice = d.client_unit_price ?? 0
      const supplierPrice = d.supplier_unit_price ?? 0
      // 슬롯별 단가 합산 (없으면 qty × 청구단가)
      function parseH(slot: string | null | undefined) {
        if (!slot) return 0
        const m = slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
        if (!m) return 0
        return Math.max(0, (Number(m[3]) * 60 + Number(m[4]) - Number(m[1]) * 60 - Number(m[2])) / 60)
      }
      const slotSales =
        (log?.work_time_1 && log?.work_price_1 ? Math.round(parseH(log.work_time_1) * log.work_price_1) : 0) +
        (log?.work_time_2 && log?.work_price_2 ? Math.round(parseH(log.work_time_2) * log.work_price_2) : 0) +
        ((log as any)?.work_time_3 && (log as any)?.work_price_3 ? Math.round(parseH((log as any).work_time_3) * (log as any).work_price_3) : 0)
      const salesAmount = slotSales || Math.round(qty * unitPrice) || (log?.engineer_daily_wage ?? 0)
      return {
        id: log?.id ?? d.id,
        dispatch_id: d.id ?? '',
        log_date: d.start_date ?? '',
        equipment_type: typeMap[eq.type] ?? equipTypeLbl ?? (eq.type ?? ''),
        plate_no: eq.plate_no ?? equipTextPlate ?? (d.equipment_text ?? ''),
        work_device: eq.spec ?? eq.model ?? '',
        operating_hours: qty, unit_price: unitPrice, sales_amount: salesAmount,
        driver_name: d.driver_name ?? '',
        client_name: (d as any).client_name ?? d.supplier?.name ?? '',
        site_name: d.site_name ?? '', unpaid_amount: 0,
        engineer_name: log?.driver_name ?? d.driver_name ?? '',
        engineer_daily_wage: log?.engineer_daily_wage ?? Math.round(qty * supplierPrice),
        is_paid: log?.is_paid ?? false,
        work_type_1: log?.work_type_1, work_time_1: log?.work_time_1, work_price_1: log?.work_price_1,
        work_type_2: log?.work_type_2, work_time_2: log?.work_time_2, work_price_2: log?.work_price_2,
        work_type_3: (log as any)?.work_type_3, work_time_3: (log as any)?.work_time_3, work_price_3: (log as any)?.work_price_3,
        commission_amount: d.commission_amount ?? null,
        memo: d.memo ?? '',
        invoice_issued: log?.invoice_issued ?? false,
        invoice_image_url: (log as any)?.invoice_image_url ?? '',
      }
    })
    setRows(mapped)
    const w: Record<string, number> = {}; const p: Record<string, boolean> = {}; const iv: Record<string, boolean> = {}; const imgs: Record<string, string> = {}
    mapped.forEach(r => { w[r.id] = r.engineer_daily_wage; p[r.id] = r.is_paid; iv[r.id] = r.invoice_issued ?? false; if (r.invoice_image_url) imgs[r.id] = r.invoice_image_url })
    setWages(w); setPaid(p); setInvoiced(iv); setInvoiceImages(imgs); setLoading(false)
  }

  async function saveMemo(dispatchId: string, val: string) {
    setRows(rows => rows.map(r => r.dispatch_id === dispatchId ? { ...r, memo: val } : r))
    await supabase.from('dispatches').update({ memo: val || null }).eq('id', dispatchId)
  }

  async function saveOwnerName(dispatchId: string, val: string) {
    setRows(rows => rows.map(r => r.dispatch_id === dispatchId ? { ...r, driver_name: val } : r))
    await supabase.from('dispatches').update({ driver_name: val || null }).eq('id', dispatchId)
  }

  async function saveWage(logId: string, val: number) {
    setWages(w => ({ ...w, [logId]: val }))
    await supabase.from('daily_logs').update({ engineer_daily_wage: val }).eq('id', logId)
  }
  async function togglePaid(logId: string, val: boolean) {
    setPaid(p => ({ ...p, [logId]: val }))
    await supabase.from('daily_logs').update({ is_paid: val }).eq('id', logId)
  }
  async function toggleInvoiced(logId: string, val: boolean) {
    setInvoiced(iv => ({ ...iv, [logId]: val }))
    await supabase.from('daily_logs').update({ invoice_issued: val }).eq('id', logId)
  }
  async function uploadInvoiceImage(logId: string, file: File) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${logId}.${ext}`
    const { error } = await supabase.storage.from('invoices').upload(path, file, { upsert: true })
    if (error) { alert('업로드 실패: ' + error.message); return }
    const { data } = supabase.storage.from('invoices').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()
    await supabase.from('daily_logs').update({ invoice_image_url: url, invoice_issued: true }).eq('id', logId)
    setInvoiceImages(iv => ({ ...iv, [logId]: url }))
    setInvoiced(iv => ({ ...iv, [logId]: true }))
  }
  async function deleteInvoiceImage(logId: string) {
    const url = invoiceImages[logId] ?? ''
    const path = url.split('/invoices/')[1]?.split('?')[0]
    if (path) await supabase.storage.from('invoices').remove([path])
    await supabase.from('daily_logs').update({ invoice_image_url: null, invoice_issued: false }).eq('id', logId)
    setInvoiceImages(iv => { const n = { ...iv }; delete n[logId]; return n })
    setInvoiced(iv => ({ ...iv, [logId]: false }))
    setViewingInvoice(null)
  }
  async function handleBulkInvoice(val: boolean) {
    if (selectedRows.size === 0) return
    const ids = Array.from(selectedRows)
    await Promise.all(ids.map(id => supabase.from('daily_logs').update({ invoice_issued: val }).eq('id', id)))
    setInvoiced(iv => { const n = { ...iv }; ids.forEach(id => { n[id] = val }); return n })
    setSelectedRows(new Set())
  }

  async function handleDelete(row: LedgerRow) {
    setDeleting(true)
    if (row.id === row.dispatch_id) {
      // daily_log 없는 dispatch-only 행 → dispatch 삭제
      await supabase.from('dispatches').delete().eq('id', row.dispatch_id)
    } else {
      await supabase.from('daily_logs').delete().eq('id', row.id)
    }
    setDeleteConfirm(null)
    setDeleting(false)
    load()
  }

  async function handleBulkDriverChange(clearOnly = false) {
    if (!clearOnly && (!bulkDriver.trim() || selectedRows.size === 0)) return
    if (selectedRows.size === 0) return
    const ids = Array.from(selectedRows)
    const val = clearOnly ? null : bulkDriver.trim()
    const update: any = { driver_name: val }
    if (clearOnly) update.engineer_daily_wage = null  // 운전자 지우기 시 급여도 클리어
    await Promise.all(ids.map(id => supabase.from('daily_logs').update(update).eq('id', id)))
    if (clearOnly) setWages(w => { const n = { ...w }; ids.forEach(id => { n[id] = 0 }); return n })
    setSelectedRows(new Set()); setBulkDriver(''); load()
  }

  async function handleBulkOwnerChange(clearOnly = false) {
    if (!clearOnly && (!bulkOwner.trim() || selectedRows.size === 0)) return
    if (selectedRows.size === 0) return
    const dispatchIds = sorted.filter(r => selectedRows.has(r.id)).map(r => r.dispatch_id).filter(Boolean)
    const val = clearOnly ? null : bulkOwner.trim()
    await Promise.all(dispatchIds.map(id => supabase.from('dispatches').update({ driver_name: val }).eq('id', id)))
    setSelectedRows(new Set()); setBulkOwner(''); load()
  }

  async function handleExcelExport() {
    const XLSX = await import('xlsx')
    const label = dateFrom && dateTo ? `${dateFrom}~${dateTo}` : '전체'
    const data = sorted.map((r, i) => ({
      'No': i + 1,
      '날짜': r.log_date,
      '차량번호': r.plate_no,
      '장비종류': r.equipment_type,
      '차주명': r.driver_name,
      '발주처': r.client_name,
      '현장명': r.site_name,
      '작업내용': r.work_device,
      '기사명': r.engineer_name,
      '배차금액': r.sales_amount || wages[r.id] || 0,
      '미수금': paid[r.id] ? 0 : (r.sales_amount || wages[r.id] || 0),
      '노무비': wages[r.id] ?? r.engineer_daily_wage,
      '비고': r.memo ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    // 컬럼 너비
    ws['!cols'] = [
      {wch:5},{wch:12},{wch:12},{wch:12},{wch:10},{wch:14},{wch:16},{wch:12},{wch:10},
      {wch:12},{wch:12},{wch:12},{wch:16},
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '배차내역')
    XLSX.writeFile(wb, `배차내역_${label}.xlsx`)
  }

  async function handleExport() {
    if (!exportPrintRef.current) return
    setExporting(true)
    setExportVisible(true)
    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const { toJpeg } = await import('html-to-image')
      const label = dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : '전체'
      const title = search.trim() ? `${search.trim()} 상세 내역` : '배차내역서'
      const filename = `배차내역_${search.trim() || label}.jpg`
      const dataUrl = await toJpeg(exportPrintRef.current, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: 2 })
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'image/jpeg' })

      // 1순위: Web Share API (모바일 → 카톡 선택창)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        setExportVisible(false)
        try {
          await navigator.share({ files: [file], title })
          return
        } catch (e: any) {
          if (e?.name === 'AbortError') return
        }
      }

      // 2순위: 클립보드 PNG 복사 (데스크탑 → 카톡 Ctrl+V)
      let clipOk = false
      try {
        const canvas = document.createElement('canvas')
        const img = new Image()
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = dataUrl })
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const pngBlob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob 실패')), 'image/png')
        )
        // ClipboardItem을 Promise로 전달 (브라우저 제한 우회)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(pngBlob) })])
        clipOk = true
      } catch (e) {
        console.warn('클립보드 복사 실패:', e)
      }

      setExportVisible(false)

      if (clipOk) {
        alert('✅ 클립보드에 복사됐습니다!\n카카오톡 채팅창에서 Ctrl+V로 붙여넣기 하세요.')
        return
      }

      // 3순위: 다운로드
      const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click()
      alert(`📥 "${filename}" 파일로 다운로드됩니다.\n(클립보드 복사가 지원되지 않는 브라우저)`)
    } catch (e) {
      console.error(e)
      setExportVisible(false)
      alert('내보내기 오류: ' + String(e))
    } finally {
      setExporting(false)
    }
  }

  async function openLogModal(row: LedgerRow) {
    const { data: disp } = await supabase.from('dispatches')
      .select('*, equipment:equipment(*, supplier:suppliers(*)), supplier:suppliers(*)')
      .eq('id', row.dispatch_id).single()
    const logId = row.id !== row.dispatch_id ? row.id : null
    const log = {
      ...(logId ? { id: logId } : {}),
      dispatch_id: row.dispatch_id,
      log_date: row.log_date,
      quantity: row.operating_hours, driver_name: row.engineer_name,
      work_type_1: row.work_type_1, work_time_1: row.work_time_1, work_price_1: row.work_price_1,
      work_type_2: row.work_type_2, work_time_2: row.work_time_2, work_price_2: row.work_price_2,
      work_type_3: (row as any).work_type_3, work_time_3: (row as any).work_time_3, work_price_3: (row as any).work_price_3,
      engineer_daily_wage: row.engineer_daily_wage, created_at: '',
    }
    setLogModalData({ log, dispatches: disp ? [disp] : [] })
  }

  async function handleBulkEquipMatch() {
    if (!bulkPlate || selectedRows.size === 0) return
    const eq = equipOptions.find(e => e.plate_no === bulkPlate)
    if (!eq) return
    const dispatchIds = sorted.filter(r => selectedRows.has(r.id)).map(r => r.dispatch_id).filter(Boolean)
    await Promise.all(dispatchIds.map(id => supabase.from('dispatches').update({ equipment_id: eq.id, supplier_id: eq.supplier_id }).eq('id', id)))
    setBulkPlate(''); setSelectedRows(new Set()); load()
  }

  async function saveCommission(dispatchId: string, val: number) {
    await supabase.from('dispatches').update({ commission_amount: val }).eq('id', dispatchId)
    setCommissions(c => ({ ...c, [dispatchId]: val }))
  }

  async function handleBulkCommission() {
    const val = Number(bulkCommission.replace(/,/g, ''))
    if (!val || selectedRows.size === 0) return
    const ids = Array.from(selectedRows)
    const dispatchIds = sorted.filter(r => ids.includes(r.id)).map(r => r.dispatch_id).filter(Boolean)
    await Promise.all(dispatchIds.map(did => supabase.from('dispatches').update({ commission_amount: val }).eq('id', did)))
    setCommissions(c => { const n = { ...c }; sorted.filter(r => ids.includes(r.id)).forEach(r => { n[r.dispatch_id] = val }); return n })
    setBulkCommission(''); setSelectedRows(new Set())
  }

  async function handleBulkWage() {
    const val = Number(bulkWage.replace(/,/g, ''))
    if (!val || selectedRows.size === 0) return
    const ids = Array.from(selectedRows)
    await Promise.all(ids.map(id => supabase.from('daily_logs').update({ engineer_daily_wage: val }).eq('id', id)))
    setWages(w => { const n = { ...w }; ids.forEach(id => { n[id] = val }); return n })
    setBulkWage(''); setSelectedRows(new Set())
  }

  async function handleBulkClientMatch() {
    if (!bulkClientName.trim() || selectedRows.size === 0) return
    const matchedName = bulkClientName.trim()
    const dispatchIds = sorted.filter(r => selectedRows.has(r.id)).map(r => r.dispatch_id).filter(Boolean)
    await Promise.all(dispatchIds.map(id => supabase.from('dispatches').update({ client_name: matchedName }).eq('id', id)))
    setBulkClientName(''); setClientDropIdx(-1); setSelectedRows(new Set()); load()
    // 업체 매칭 후 발주처 정리 자동 열기 (해당 이름 미리 세팅)
    setMergeTarget(matchedName); setMergeSelected(new Set()); setMergeSearch(''); setClientMergeOpen(true)
  }

  async function handleClientMerge() {
    if (!mergeTarget.trim() || mergeSelected.size === 0) return
    setMergeSaving(true)
    const names = [...mergeSelected]
    await Promise.all(names.map(name =>
      supabase.from('dispatches').update({ client_name: mergeTarget.trim() }).eq('client_name', name)
    ))
    setMergeSaving(false)
    setClientMergeOpen(false)
    setMergeSelected(new Set())
    setMergeTarget('')
    load()
  }

  async function handleBulkDelete() {
    if (selectedRows.size === 0) return
    if (!confirm(selectedRows.size + '건을 삭제하시겠습니까?')) return
    setDeleting(true)
    const selectedRowObjs = sorted.filter(r => selectedRows.has(r.id))
    const logIds = selectedRowObjs.filter(r => r.id !== r.dispatch_id).map(r => r.id)
    const dispatchOnlyIds = selectedRowObjs.filter(r => r.id === r.dispatch_id).map(r => r.dispatch_id)
    await Promise.all([
      ...logIds.map(id => supabase.from('daily_logs').delete().eq('id', id)),
      ...dispatchOnlyIds.map(id => supabase.from('dispatches').delete().eq('id', id)),
    ])
    setSelectedRows(new Set())
    setDeleting(false)
    load()
  }

  function toggleRowSelect(id: string) {
    setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    if (selectedRows.size === sorted.length) setSelectedRows(new Set())
    else setSelectedRows(new Set(sorted.map(r => r.id)))
  }

  useEffect(() => { load() }, [dateFrom, dateTo])

  const filtered = rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.log_date.includes(q) || r.plate_no.toLowerCase().includes(q) ||
      r.driver_name.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q) ||
      r.site_name.toLowerCase().includes(q) || r.engineer_name.toLowerCase().includes(q)
  })
  const exportRows = selectedRows.size > 0 ? filtered.filter(r => selectedRows.has(r.id)) : filtered
  const totalSales = exportRows.reduce((s, r) => s + (r.sales_amount || (wages[r.id] ?? 0)), 0)
  const totalUnpaid = exportRows.reduce((s, r) => s + (paid[r.id] ? 0 : (r.sales_amount || (wages[r.id] ?? 0))), 0)
  const totalWage = exportRows.reduce((s, r) => s + (wages[r.id] ?? r.engineer_daily_wage ?? 0), 0)
  const plateDayCounts = filtered.reduce((acc, r) => {
    const key = r.plate_no || r.dispatch_id
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any
    if (sortKey === 'unpaid_calc') { av = paid[a.id] ? 0 : a.sales_amount; bv = paid[b.id] ? 0 : b.sales_amount }
    else if (sortKey === 'engineer_daily_wage') { av = wages[a.id] ?? a.engineer_daily_wage; bv = wages[b.id] ?? b.engineer_daily_wage }
    else if (sortKey === 'invoice_status') { av = invoiced[a.id] ? 1 : 0; bv = invoiced[b.id] ? 1 : 0 }
    else if (sortKey === 'days_count') {
      const ca = plateDayCounts[a.plate_no || a.dispatch_id] || 0
      const cb = plateDayCounts[b.plate_no || b.dispatch_id] || 0
      if (ca !== cb) return (ca < cb ? -1 : 1) * (sortDir === 'asc' ? 1 : -1)
      return a.plate_no < b.plate_no ? -1 : a.plate_no > b.plate_no ? 1 : 0
    }
    else { av = a[sortKey as keyof LedgerRow]; bv = b[sortKey as keyof LedgerRow] }
    if (av === bv) {
      return a.log_date < b.log_date ? -1 : a.log_date > b.log_date ? 1 : 0
    }
    return (av < bv ? -1 : 1) * (sortDir === 'asc' ? 1 : -1)
  })
  function parseLH(slot?: string) {
    if (!slot) return 0
    const m = slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
    if (!m) return 0
    return Math.max(0, Math.round(((Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2]))) / 60 * 10) / 10)
  }
  const arrow = (k: string) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕'
  const th = 'px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 cursor-pointer select-none hover:bg-gray-100'
  const thR = 'px-3 py-2 text-right text-xs font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200 cursor-pointer select-none hover:bg-gray-100'
  const thC = 'px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap border-b border-gray-200'

  const rowProps = { editingDriver, paid, wages, commissions, invoiced, invoiceImages, clientOptions, equipOptions, setEditDispatch, openLogModal, setEditingDriver, setWages, saveDriverName, saveOwnerName, togglePaid, toggleInvoiced, saveWage, saveCommission, saveMemo, selectedRows, toggleRowSelect, onDelete: setDeleteConfirm, onInvoiceUpload: uploadInvoiceImage, onInvoiceView: setViewingInvoice }

  if (view === 'match') {
    const isClient = matchType === 'client'
    const items = isClient ? unmatchedClients : unmatchedPlates
    const mq = matchSearch.toLowerCase()
    const norm_mq = normCo(matchSearch)
    const filteredOptions = isClient
      ? allInvNames.filter(n => !matchSearch || n.toLowerCase().includes(mq) || normCo(n).includes(norm_mq) || norm_mq.includes(normCo(n)))
      : equipOptions.filter(e => !matchSearch || e.plate_no.toLowerCase().includes(mq) || (e.supplier_name ?? '').toLowerCase().includes(mq))

    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white">
          <button onClick={() => { setView('ledger'); load() }}
            className="text-gray-500 hover:text-gray-800 flex items-center gap-1 text-sm font-medium">
            &larr; 배차내역
          </button>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => { setMatchType('client'); setSelectedItem(null); setMatchSearch('') }}
              className={'px-4 py-1.5 rounded-md text-sm font-medium transition-colors ' + (isClient ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              발주처 매칭 {unmatchedClients.length > 0 && <span className="ml-1 bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full">{unmatchedClients.length}</span>}
            </button>
            <button onClick={() => { setMatchType('plate'); setSelectedItem(null); setMatchSearch('') }}
              className={'px-4 py-1.5 rounded-md text-sm font-medium transition-colors ' + (!isClient ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              차번호 매칭 {unmatchedPlates.length > 0 && <span className="ml-1 bg-purple-100 text-purple-600 text-xs px-1.5 py-0.5 rounded-full">{unmatchedPlates.length}</span>}
            </button>
          </div>
          {matchLoading && <span className="text-sm text-gray-400">로딩...</span>}
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 border-r border-gray-200 flex flex-col overflow-hidden bg-white">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
              <div className="text-xs font-semibold text-gray-500">
                {isClient ? '발주처 미매칭 ' : '차번호 미매칭 '}
                <span className="text-gray-800 font-bold">{items.length}건</span>
                <span className="ml-2 text-gray-400 font-normal">클릭하면 우측에서 매칭</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {matchLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">로딩 중...</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">모두 매칭 완료!</div>
              ) : items.map(item => (
                <button key={item.id} onClick={() => { setSelectedItem(item); setMatchSearch(isClient ? (item._displayName || item.client_name || '') : (item.equipment_text || '')) }}
                  className={'w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ' + (selectedItem?.id === item.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent')}>
                  {isClient ? (
                    <>
                      <div className="text-sm font-medium text-gray-800">{item._displayName || item.client_name || <span className="text-gray-300">(발주처 없음)</span>}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{item.site_name} {item.log_date}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-medium text-gray-800 font-mono">{item.equipment_text || '-'}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{item.driver_name || '차주 미입력'} &middot; {item.client_name || '-'} &middot; {item.log_date}</div>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="w-1/2 flex flex-col overflow-hidden bg-white">
            {!selectedItem ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                좌측에서 항목을 선택하세요
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
                  <div className="text-xs text-gray-500 mb-2">
                    {isClient ? (
                      <><span className="font-semibold text-gray-800">{selectedItem._displayName || selectedItem.client_name || '(발주처 없음)'}</span> &rarr; 인보이스 업체로 매칭</>
                    ) : (
                      <><span className="font-semibold font-mono text-gray-800">{selectedItem.equipment_text}</span> &rarr; 장비 매칭</>
                    )}
                  </div>
                  <input autoFocus type="text" value={matchSearch} onChange={e => setMatchSearch(e.target.value)}
                    placeholder={isClient ? '업체명 검색...' : '차번호 검색...'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                  {isClient ? (
                    filteredOptions.length === 0 ? (
                      <div className="p-6 text-center text-gray-400 text-sm">검색 결과가 없습니다</div>
                    ) : (filteredOptions as string[]).map(name => (
                      <button key={name} disabled={matchSaving} onClick={() => saveClientMatch(selectedItem.id, name)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors text-sm text-gray-800 disabled:opacity-50">
                        {name}
                      </button>
                    ))
                  ) : (
                    <>
                      {(filteredOptions as EquipOpt[]).length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-sm">검색 결과가 없습니다</div>
                      ) : (filteredOptions as EquipOpt[]).map(eq => (
                        <button key={eq.id} disabled={matchSaving} onClick={() => savePlateMatch(selectedItem.id, eq)}
                          className="w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors disabled:opacity-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-mono font-medium text-gray-800">{eq.plate_no}</span>
                              {eq.supplier_name && <span className="ml-2 text-xs text-gray-500">{eq.supplier_name}</span>}
                            </div>
                            <span className={'text-xs px-2 py-0.5 rounded-full ' + (eq.ownership === 'own' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>
                              {eq.ownership === 'own' ? '자차' : '타사'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 같은 배차 안의 시간대만 병합한다. 서로 다른 배차를 합치면 수정 대상이 모호해진다.
  type MergedGroup = { r: LedgerRow; slots: { type: string; hrs: number; price: number }[] }
  const groups: MergedGroup[] = []
  const groupKeyMap = new Map<string, number>()

  const normStr = (s: string) => (s || '').replace(/\s/g, '').toLowerCase()
  const getGroupKey = (r: LedgerRow) => {
    const plateNorm = normStr(r.plate_no)
    const plateDigits = plateNorm.replace(/[^0-9]/g, '').slice(-4)
    return plateDigits.length >= 4
      ? `${r.log_date}|${plateDigits}|${r.dispatch_id}`
      : `${r.log_date}|${normStr(r.driver_name)}|${normStr(r.site_name)}|${r.dispatch_id}`
  }

  for (const r of sorted) {
    const rKey = getGroupKey(r)
    const rowSlots: { type: string; hrs: number; price: number }[] = []
    const addSlot = (wt?: string, wtime?: string, wp?: number) => {
      if (!wt || !wtime) return
      const h = parseLH(wtime); const p = Number(wp) || 0
      const ex = rowSlots.find(s => s.type === wt)
      if (ex) ex.hrs = Math.round((ex.hrs + h) * 10) / 10
      else rowSlots.push({ type: wt, hrs: h, price: p })
    }
    addSlot(r.work_type_1, r.work_time_1, r.work_price_1)
    addSlot(r.work_type_2, r.work_time_2, r.work_price_2)
    addSlot((r as any).work_type_3, (r as any).work_time_3, (r as any).work_price_3)

    const existingIdx = groupKeyMap.get(rKey)
    if (existingIdx !== undefined) {
      const existing = groups[existingIdx]
      // 차종/차번호 등 빈 필드를 현재 행에서 보완
      if (!existing.r.equipment_type && r.equipment_type) existing.r = { ...existing.r, equipment_type: r.equipment_type }
      if (!existing.r.plate_no && r.plate_no) existing.r = { ...existing.r, plate_no: r.plate_no }
      if (!existing.r.driver_name && r.driver_name) existing.r = { ...existing.r, driver_name: r.driver_name }
      for (const s of rowSlots) {
        const ex = existing.slots.find(es => es.type === s.type)
        if (ex) ex.hrs = Math.round((ex.hrs + s.hrs) * 10) / 10
        else existing.slots.push(s)
      }
    } else {
      groupKeyMap.set(rKey, groups.length)
      groups.push({ r, slots: rowSlots })
    }
  }

  const tableRows = groups.flatMap(({ r, slots }) => {
    const dayCount = plateDayCounts[r.plate_no || r.dispatch_id] || 1
    if (slots.length === 0) return [<LedgerTableRow key={r.id} r={r} bg="hover:bg-gray-50 transition-colors" hrs={0} unitP={0} sales={0} isFirstSlot={true} slotsTotalSales={0} dayCount={dayCount} {...rowProps} />]
    const colors = ['hover:bg-gray-50 transition-colors', 'hover:bg-purple-50 transition-colors', 'hover:bg-blue-50 transition-colors']
    const slotsTotalSales = slots.reduce((sum, m) => sum + (m.hrs && m.price ? Math.round(m.hrs * m.price) : 0), 0)
    return slots.map((m, i) => (
      <LedgerTableRow key={r.id + '_m' + i} r={r} bg={colors[i] ?? colors[0]} hrs={m.hrs} unitP={m.price} sales={m.hrs && m.price ? Math.round(m.hrs * m.price) : 0} isFirstSlot={i === 0} slotsTotalSales={slotsTotalSales} dayCount={i === 0 ? dayCount : 0} {...rowProps} />
    ))
  })

  return (
    <>
    <div className="p-4 md:p-6" ref={exportRef}>
      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-sm text-blue-700 font-medium">{selectedRows.size}행 선택됨</span>
          <input type="text" value={bulkOwner} onChange={e => setBulkOwner(e.target.value)}
            placeholder="차주명 입력..."
            className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" />
          <button onClick={() => handleBulkOwnerChange()} disabled={!bulkOwner.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            차주명 변경
          </button>
          <button onClick={() => handleBulkOwnerChange(true)}
            className="border border-blue-300 text-blue-600 text-sm font-medium px-2 py-1.5 rounded-lg hover:bg-blue-50">
            차주 지우기
          </button>
          <input type="text" value={bulkDriver} onChange={e => setBulkDriver(e.target.value)}
            placeholder="운전자명 입력..."
            className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36" />
          <button onClick={() => handleBulkDriverChange()} disabled={!bulkDriver.trim()}
            className="bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            운전자명 변경
          </button>
          <button onClick={() => handleBulkDriverChange(true)}
            className="border border-sky-300 text-sky-600 text-sm font-medium px-2 py-1.5 rounded-lg hover:bg-sky-50">
            운전자 지우기
          </button>
          <select value={bulkPlate} onChange={e => setBulkPlate(e.target.value)}
            className="px-2 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none w-44">
            <option value="">-- 차량 선택 --</option>
            {equipOptions.map(e => <option key={e.id} value={e.plate_no}>{e.plate_no}{e.supplier_name ? ` (${e.supplier_name})` : ''}</option>)}
          </select>
          <button onClick={handleBulkEquipMatch} disabled={!bulkPlate}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            차번호 매칭
          </button>
          <div className="relative">
            <input value={bulkClientName}
              onChange={e => { setBulkClientName(e.target.value); setClientDropOpen(true); setClientDropIdx(-1) }}
              onCompositionEnd={e => { setBulkClientName((e.target as HTMLInputElement).value); setClientDropOpen(true); setClientDropIdx(-1) }}
              onFocus={() => setClientDropOpen(true)}
              onBlur={() => setTimeout(() => { setClientDropOpen(false); setClientDropIdx(-1) }, 150)}
              onKeyDown={e => {
                const opts = clientOptions.filter(c => c.includes(bulkClientName))
                if (e.key === 'ArrowDown') { e.preventDefault(); setClientDropIdx(i => Math.min(i + 1, opts.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setClientDropIdx(i => Math.max(i - 1, 0)) }
                else if (e.key === 'Enter' && clientDropIdx >= 0 && opts[clientDropIdx]) { setBulkClientName(opts[clientDropIdx]); setClientDropOpen(false); setClientDropIdx(-1) }
                else if (e.key === 'Escape') { setClientDropOpen(false); setClientDropIdx(-1) }
              }}
              placeholder="발주처..."
              className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none w-36" />
            {clientDropOpen && bulkClientName && (
              <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto w-48">
                {clientOptions.filter(c => c.includes(bulkClientName)).map((c, i) => (
                  <div key={c} onMouseDown={() => { setBulkClientName(c); setClientDropOpen(false); setClientDropIdx(-1) }}
                    className={`px-3 py-2 text-sm cursor-pointer text-gray-700 ${i === clientDropIdx ? 'bg-blue-100' : 'hover:bg-blue-50'}`}>{c}</div>
                ))}
                {clientOptions.filter(c => c.includes(bulkClientName)).length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">검색 결과 없음</div>
                )}
              </div>
            )}
          </div>
          <button onClick={handleBulkClientMatch} disabled={!bulkClientName.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            업체 매칭
          </button>
          <input type="text" value={bulkWage} onChange={e => setBulkWage(e.target.value)}
            placeholder="급여 입력..."
            className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none w-32" />
          <button onClick={handleBulkWage} disabled={!bulkWage.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            급여 일괄입력
          </button>
          <input type="text" value={bulkCommission} onChange={e => setBulkCommission(e.target.value)}
            placeholder="수수료 입력..."
            className="px-3 py-1.5 border border-orange-300 rounded-lg text-sm focus:outline-none w-32" />
          <button onClick={handleBulkCommission} disabled={!bulkCommission.trim()}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            수수료 일괄입력
          </button>
          <button onClick={() => handleBulkInvoice(true)}
            className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg">
            청구완료 처리
          </button>
          <button onClick={() => handleBulkInvoice(false)}
            className="border border-gray-300 text-gray-600 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-gray-50">
            발행취소
          </button>
          <button onClick={handleBulkDelete} disabled={deleting}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium px-4 py-1.5 rounded-lg">
            {deleting ? '삭제 중...' : '선택 삭제'}
          </button>
          <button onClick={() => setSelectedRows(new Set())} className="text-gray-400 hover:text-gray-600 text-sm ml-auto">취소</button>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">배차내역서</h1>
        <div className="flex gap-2">
          <button onClick={() => setNewDispatchOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            + 배차 등록
          </button>
          <button onClick={() => { setClientMergeOpen(true); setMergeSelected(new Set()); setMergeTarget(''); setMergeSearch('') }}
            className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
            🔀 발주처 정리
          </button>
          <button onClick={() => setExcelOpen(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg">
            📂 엑셀 업로드
          </button>
          <button onClick={handleExcelExport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            📊 엑셀 내보내기
          </button>
          <button onClick={handleExport} disabled={exporting}
            className="bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {exporting ? '처리 중...' : '📤 JPG 내보내기'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => { setDateFrom(''); setDateTo('') }}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${!dateFrom && !dateTo ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            전체
          </button>
        </div>
        <input type="text" placeholder="차량번호, 차주명, 발주처명..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-48" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">총 배차액</div>
          <div className="text-lg font-bold text-blue-700">{totalSales.toLocaleString()}원</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">건수</div>
          <div className="text-lg font-bold text-gray-800">{exportRows.length}건{selectedRows.size > 0 ? <span className="text-xs font-normal text-blue-500 ml-1">(선택)</span> : ''}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 border-b border-gray-200">
                <input type="checkbox" checked={selectedRows.size > 0 && selectedRows.size === sorted.length} onChange={toggleSelectAll} className="w-4 h-4 accent-blue-600 cursor-pointer" />
              </th>
              <th className={th} onClick={() => handleSort('log_date')}>거래일{arrow('log_date')}</th>
              <th className={th} onClick={() => handleSort('equipment_type')}>차종{arrow('equipment_type')}</th>
              <th className={th} onClick={() => handleSort('plate_no')}>차량번호{arrow('plate_no')}</th>
              <th className={th} onClick={() => handleSort('work_device')}>작업장치{arrow('work_device')}</th>
              <th className={thR} onClick={() => handleSort('operating_hours')}>가동시간{arrow('operating_hours')}</th>
              <th className={thR} onClick={() => handleSort('unit_price')}>단가{arrow('unit_price')}</th>
              <th className={thR} onClick={() => handleSort('sales_amount')}>매출액{arrow('sales_amount')}</th>
              <th className={th} onClick={() => handleSort('driver_name')}>차주명{arrow('driver_name')}</th>
              <th className={th} onClick={() => handleSort('client_name')}>발주처명{arrow('client_name')}</th>
              <th className={th} onClick={() => handleSort('site_name')}>현장명{arrow('site_name')}</th>
              <th className={th} onClick={() => handleSort('engineer_name')}>운전자명{arrow('engineer_name')}</th>
              <th className={thR}>수수료</th>
              <th className={thR} onClick={() => handleSort('engineer_daily_wage')}>급여{arrow('engineer_daily_wage')}</th>
              <th className={th}>비고</th>
              <th className={th} onClick={() => handleSort('invoice_status')}>청구{arrow('invoice_status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={16} className="px-3 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={16} className="px-3 py-8 text-center text-gray-400">데이터가 없습니다.</td></tr>
            ) : tableRows}
            {!loading && filtered.length > 0 && (
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                <td className={td}>합계{selectedRows.size > 0 ? ` (선택 ${selectedRows.size}건)` : ''}</td>
                <td className={td + ' text-gray-500'}>{exportRows.length}일</td>
                <td colSpan={5}></td>
                <td className={tdr + ' text-blue-700'}>{totalSales.toLocaleString()}</td>
                <td colSpan={3}></td>
                <td></td>
                <td className={tdr + ' text-orange-600'}>{sorted.reduce((s, r) => s + (commissions[r.dispatch_id] ?? r.commission_amount ?? 0), 0).toLocaleString()}</td>
                <td className={tdr}>{totalWage.toLocaleString()}</td>
                <td></td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {clientMergeOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <h2 className="font-bold text-gray-900">발주처명 통합</h2>
              <button onClick={() => setClientMergeOpen(false)} className="text-gray-400 text-xl">✕</button>
            </div>
            <div className="px-6 py-3 border-b shrink-0 space-y-2">
              <p className="text-xs text-gray-500">약자·중복 이름을 선택하면 아래 정식명으로 일괄 교체됩니다.</p>
              <input value={mergeSearch}
                onChange={e => setMergeSearch(e.target.value)}
                onCompositionEnd={e => setMergeSearch((e.target as HTMLInputElement).value)}
                placeholder="검색..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
              <div className="flex gap-2 items-center">
                <input value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}
                  placeholder="교체할 정식 발주처명..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
                <button onClick={handleClientMerge}
                  disabled={!mergeTarget.trim() || mergeSelected.size === 0 || mergeSaving}
                  className="bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap">
                  {mergeSaving ? '처리 중...' : `통합 (${mergeSelected.size}건)`}
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-3 space-y-1">
              {[...clientOptions].sort((a, b) => a.localeCompare(b, 'ko')).filter(c => !mergeSearch || c.includes(mergeSearch)).map(c => {
                const checked = mergeSelected.has(c)
                return (
                  <label key={c} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-rose-50 border border-rose-200' : 'hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setMergeSelected(s => { const n = new Set(s); checked ? n.delete(c) : n.add(c); return n })}
                      className="w-4 h-4 accent-rose-500" />
                    <span className="text-sm text-gray-800">{c}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {excelOpen && <LedgerExcelUploadModal onClose={() => { setExcelOpen(false); load() }} onSaved={() => { setExcelOpen(false); load() }} />}
      {editDispatch && (
        <DispatchEditModal row={editDispatch} equipOptions={equipOptions} clientOptions={clientOptions}
          onClose={() => setEditDispatch(null)} onSaved={() => { setEditDispatch(null); load() }} />
      )}
      {logModalData && (
        <LogModal
          log={logModalData.log}
          dispatches={logModalData.dispatches}
          equipment={fullEquipment}
          suppliers={allSuppliers}
          clients={allClients}
          onClose={() => setLogModalData(null)}
          onSaved={() => { setLogModalData(null); load() }}
        />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="font-bold text-gray-900 mb-2">일보 삭제</div>
            <div className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{deleteConfirm.log_date}</span> &middot; <span className="font-medium">{deleteConfirm.plate_no || '-'}</span> &middot; {deleteConfirm.client_name || '-'}<br/>
              이 일보를 삭제하시겠습니까?
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">취소</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 내보내기용 hidden 테이블 */}
      <div style={exportVisible
        ? { position: 'fixed', top: 0, left: 0, zIndex: 9999, width: 700, background: '#fff', padding: 32, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }
        : { position: 'fixed', top: 0, left: '-9999px', width: 700, background: '#fff', padding: 32, fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif', visibility: 'hidden' }
      } ref={exportPrintRef}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 6 }}>🏗️ {search.trim() ? `${search.trim()} 상세 내역` : '배차내역서'}</div>
          <div style={{ fontSize: 14, color: '#555' }}>기간: {dateFrom && dateTo ? `${dateFrom} ~ ${dateTo}` : '전체'} &nbsp; {exportRows.length}건{selectedRows.size > 0 ? ' (선택)' : ''}</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#fff' }}>
              <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, width: 40 }}>No.</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>날짜</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>차종</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>차량번호</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>현장명</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>수량</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>단가</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {exportRows.map((r, i) => {
              const amt = r.sales_amount || (wages[r.id] ?? 0)
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '9px 12px', textAlign: 'center', color: '#666' }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px' }}>{r.log_date}</td>
                  <td style={{ padding: '9px 12px' }}>{r.equipment_type || '-'}</td>
                  <td style={{ padding: '9px 12px' }}>{r.plate_no || '-'}</td>
                  <td style={{ padding: '9px 12px' }}>{r.site_name || '-'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r.operating_hours || '-'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{(r.unit_price || 0).toLocaleString()}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>{amt.toLocaleString()}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f0f4f8', borderTop: '2px solid #cbd5e1' }}>
              <td colSpan={4} style={{ padding: '11px 12px', fontWeight: 700, textAlign: 'center' }}>합 계</td>
              <td style={{ padding: '11px 12px', fontWeight: 700, textAlign: 'center', color: '#374151' }}>{exportRows.length}일</td>
              <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700 }}>{exportRows.reduce((s, r) => s + (r.operating_hours || 0), 0) > 0 ? exportRows.reduce((s, r) => s + (r.operating_hours || 0), 0) + '시간' : ''}</td>
              <td />
              <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626', fontSize: 15 }}>{totalSales.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    {/* 세금계산서 이미지 미리보기 모달 */}
    {viewingInvoice && invoiceImages[viewingInvoice] && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setViewingInvoice(null)}>
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-bold text-gray-800">세금계산서</span>
            <div className="flex gap-2">
              <a href={invoiceImages[viewingInvoice]} target="_blank" rel="noreferrer"
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">열기</a>
              <button onClick={() => { if (confirm('이미지를 삭제하시겠습니까?')) deleteInvoiceImage(viewingInvoice!) }}
                className="text-xs px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">삭제</button>
              <button onClick={() => setViewingInvoice(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>
          </div>
          <div className="p-2 max-h-[80vh] overflow-auto">
            <img src={invoiceImages[viewingInvoice]} alt="세금계산서" className="w-full rounded" />
          </div>
        </div>
      </div>
    )}
      {newDispatchOpen && (
        <DispatchModal
          dispatch={null}
          equipment={fullEquipment}
          suppliers={allSuppliers}
          onClose={() => setNewDispatchOpen(false)}
          onSaved={() => { setNewDispatchOpen(false); load() }}
        />
      )}
    </>
  )
}

function LedgerTableRow({ r, bg, hrs, unitP, sales, isFirstSlot, slotsTotalSales, dayCount, editingDriver, paid, wages, commissions, invoiced, invoiceImages, clientOptions, equipOptions, setEditDispatch, openLogModal, setEditingDriver, setWages, saveDriverName, saveOwnerName, togglePaid, toggleInvoiced, saveWage, saveCommission, saveMemo, selectedRows, toggleRowSelect, onDelete, onInvoiceUpload, onInvoiceView }: {
  r: LedgerRow; bg: string; hrs: number; unitP: number; sales: number; isFirstSlot: boolean; slotsTotalSales: number; dayCount: number
  editingDriver: string | null; paid: Record<string, boolean>; wages: Record<string, number>; commissions: Record<string, number>; invoiced: Record<string, boolean>; invoiceImages: Record<string, string>
  clientOptions: string[]; equipOptions: EquipOpt[]
  setEditDispatch: (r: LedgerRow) => void; openLogModal: (r: LedgerRow) => void; setEditingDriver: (id: string | null) => void
  setWages: (fn: (w: Record<string, number>) => Record<string, number>) => void
  saveDriverName: (id: string, dispatchId: string, val: string) => void
  saveOwnerName: (dispatchId: string, val: string) => void
  togglePaid: (id: string, checked: boolean) => void; toggleInvoiced: (id: string, val: boolean) => void
  saveWage: (id: string, val: number) => void
  saveCommission: (dispatchId: string, val: number) => void
  saveMemo: (dispatchId: string, val: string) => void
  selectedRows: Set<string>; toggleRowSelect: (id: string) => void; onDelete: (r: LedgerRow) => void
  onInvoiceUpload: (logId: string, file: File) => void; onInvoiceView: (logId: string) => void
}) {
  const [editingPlateDriver, setEditingPlateDriver] = useState(false)
  const [editingMemo, setEditingMemo] = useState(false)
  const invoiceFileRef = useRef<HTMLInputElement>(null)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const isToday = r.log_date === todayStr
  const rowClass = `${isToday ? 'bg-amber-50/80 hover:bg-amber-100/80 transition-colors' : bg}${selectedRows.has(r.id) ? ' bg-blue-50' : ''}`
  return (
    <tr className={rowClass}>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={selectedRows.has(r.id)} onChange={() => toggleRowSelect(r.id)} className="w-4 h-4 accent-blue-600 cursor-pointer" />
      </td>
      <td className={td}>
        {isToday ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-200 px-2 py-0.5 font-bold text-amber-950 ring-1 ring-amber-400">
            {r.log_date}
            <span className="text-[10px] font-black">오늘</span>
          </span>
        ) : r.log_date}
      </td>
      <td className={td}>{r.equipment_type}</td>
      <td className={td}>
        <button onClick={() => openLogModal(r)} className="text-blue-600 hover:underline font-medium">
          {r.plate_no || <span className="text-gray-300">+</span>}
        </button>
      </td>
      <td className={td}>{r.work_device}</td>
      <td className={tdr}>{hrs > 0 ? hrs + 'h' : r.operating_hours}</td>
      <td className={tdr}>{unitP > 0 ? unitP.toLocaleString() : r.unit_price.toLocaleString()}</td>
      <td className={tdr + ' font-medium text-blue-700'}>{(sales > 0 ? sales : (r.sales_amount || (wages[r.id] ?? 0))).toLocaleString()}</td>
      <td className={td}>
        {editingPlateDriver ? (
          <input autoFocus defaultValue={r.driver_name}
            onBlur={e => { saveOwnerName(r.dispatch_id, e.target.value); setEditingPlateDriver(false) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-24 border border-blue-400 rounded px-1 text-sm focus:outline-none" />
        ) : (
          <button onClick={() => setEditingPlateDriver(true)} className="text-left hover:text-blue-600 w-full">
            {r.driver_name || <span className="text-gray-300">+</span>}
          </button>
        )}
      </td>
      <td className={td}>{r.client_name || <span className="text-gray-300">-</span>}</td>
      <td className={td}>{r.site_name}</td>
      <td className={td}>
        {editingDriver === r.id ? (
          <input autoFocus defaultValue={r.engineer_name || r.driver_name}
            onBlur={e => saveDriverName(r.id, r.dispatch_id, e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-24 border border-blue-400 rounded px-1 text-sm focus:outline-none" />
        ) : (
          <button onClick={() => setEditingDriver(r.id)} className="text-left hover:text-blue-600 w-full">
            {r.engineer_name || r.driver_name || <span className="text-gray-300">+</span>}
          </button>
        )}
      </td>
      <td className="px-1 py-1">
        {isFirstSlot && <CommissionCell dispatchId={r.dispatch_id} initial={commissions[r.dispatch_id] ?? r.commission_amount ?? 0} onSave={saveCommission} />}
      </td>
      <td className="px-1 py-1">
        {isFirstSlot && (
          <input type="number"
            value={wages[r.id] ?? 0}
            onChange={e => { const raw = Number(e.target.value); if (!isNaN(raw)) setWages(w => ({ ...w, [r.id]: raw })) }}
            onBlur={e => saveWage(r.id, Number(e.target.value))}
            className="w-24 text-right px-2 py-1 text-sm border border-transparent rounded hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent text-green-700 font-medium" />
        )}
      </td>
      <td className={td}>
        {editingMemo ? (
          <input autoFocus defaultValue={r.memo ?? ''}
            onBlur={e => { saveMemo(r.dispatch_id, e.target.value); setEditingMemo(false) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-32 border border-blue-400 rounded px-1 text-sm focus:outline-none" />
        ) : (
          <button onClick={() => setEditingMemo(true)} className="text-left hover:text-blue-600 w-full min-w-16">
            {r.memo || <span className="text-gray-300">+</span>}
          </button>
        )}
      </td>
      <td className="px-2 py-1 whitespace-nowrap">
        <button
          onClick={() => { if (invoiceImages[r.id]) { onInvoiceView(r.id) } else { invoiceFileRef.current?.click() } }}
          className={`text-xs px-2 py-1 rounded border mr-1 transition-colors ${invoiced[r.id] ? 'bg-green-100 text-green-700 border-green-300 font-medium' : 'text-gray-400 border-gray-200 hover:border-green-300 hover:text-green-600'}`}>
          {invoiceImages[r.id] ? '청구완료📄' : invoiced[r.id] ? '청구완료✓' : '청구완료'}
        </button>
        <input ref={invoiceFileRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onInvoiceUpload(r.id, f); e.target.value = '' }} />
        <button onClick={() => onDelete(r)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded border border-red-100 hover:border-red-300">삭제</button>
      </td>
    </tr>
  )
}

function CommissionCell({ dispatchId, initial, onSave }: { dispatchId: string; initial: number; onSave: (id: string, val: number) => void }) {
  const [val, setVal] = useState(initial)
  useEffect(() => { setVal(initial) }, [initial])
  return (
    <input type="text" value={val.toLocaleString()}
      onChange={e => { const raw = Number(e.target.value.replace(/,/g, '')); if (!isNaN(raw)) setVal(raw) }}
      onBlur={() => onSave(dispatchId, val)}
      className="w-24 text-right px-2 py-1 text-sm border border-transparent rounded hover:border-orange-300 focus:border-orange-500 focus:outline-none bg-transparent text-orange-600" />
  )
}

function DispatchEditModal({ row, equipOptions, clientOptions, onClose, onSaved }: {
  row: LedgerRow; equipOptions: EquipOpt[]; clientOptions: string[]
  onClose: () => void; onSaved: () => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    plate_no: row.plate_no || '', client_name: row.client_name || '',
    site_name: row.site_name || '', driver_name: row.driver_name || '',
    unit_price: String(row.unit_price || ''), operating_hours: String(row.operating_hours || ''),
  })
  async function handleSave() {
    setSaving(true)
    await supabase.from('dispatches').update({
      plate_no: form.plate_no || null,
      client_name: form.client_name || null,
      site_name: form.site_name || null,
      driver_name: form.driver_name || null,
      unit_price: Number(form.unit_price) || null,
      operating_hours: Number(form.operating_hours) || null,
    }).eq('id', row.dispatch_id)
    setSaving(false)
    onSaved()
  }
  const fields = [
    { label: '차량번호', key: 'plate_no' as const },
    { label: '발주처명', key: 'client_name' as const },
    { label: '현장명', key: 'site_name' as const },
    { label: '차주명', key: 'driver_name' as const },
    { label: '단가', key: 'unit_price' as const },
    { label: '가동시간', key: 'operating_hours' as const },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="font-bold text-gray-900 mb-4">배차 정보 수정</div>
        <div className="space-y-3">
          {fields.map(({ label, key }) => (
            <div key={key}>
              <label className="text-xs text-gray-500 mb-1 block">{label}</label>
              <input value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
