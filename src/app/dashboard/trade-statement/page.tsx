'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import SupplierEquipmentModal from '../equipment/SupplierEquipmentModal'

function numToKorean(n: number): string {
  if (n === 0) return '영원정'
  const units4 = ['', '만', '억', '조']
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const p = ['', '십', '백', '천']
  function chunk(v: number) {
    if (!v) return ''
    let s = ''
    for (let i = 3; i >= 0; i--) {
      const digit = Math.floor(v / Math.pow(10, i)) % 10
      if (digit) s += (digit === 1 && i > 0 ? '' : d[digit]) + p[i]
    }
    return s
  }
  let tmp = n, ui = 0
  const parts: string[] = []
  while (tmp > 0) {
    const c = tmp % 10000
    if (c) parts.unshift(chunk(c) + units4[ui])
    tmp = Math.floor(tmp / 10000)
    ui++
  }
  return parts.join('') + '원정'
}

const DEFAULT_COMPANY = {
  name: '㈜가온건설중기',
  reg_no: '315-81-39390',
  ceo: '이현정',
  address: '청주시 흥덕구 옥산면 오산덕촌길 57-21',
  biz_type: '건설업',
  biz_item: '건설장비 운영업',
  bank: '농협 351-1301-4357-03',
  phone: '010-5596-2177',
}

interface EditRow {
  _key: string
  log_date: string
  equipment_type: string
  plate_no: string
  work_content: string
  quantity: string
  unit_price: string
  note: string
}

function newBlankRow(): EditRow {
  return {
    _key: Math.random().toString(36).slice(2),
    log_date: '',
    equipment_type: '',
    plate_no: '',
    work_content: '',
    quantity: '',
    unit_price: '',
    note: '',
  }
}

function calcRow(r: EditRow) {
  const qty = parseFloat(r.quantity) || 0
  const price = parseFloat(r.unit_price.replace(/,/g, '')) || 0
  const supply = Math.round(qty * price)
  const vat = Math.round(supply * 0.1)
  return { qty, price, supply, vat }
}

export default function TradeStatementPage() {
  const supabase = createClient()
  const today = new Date().toISOString().slice(0, 10)
  const firstDay = today.slice(0, 7) + '-01'

  const [dateFrom, setDateFrom] = useState(firstDay)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<string[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [sites, setSites] = useState<string[]>([])
  const [selectedSite, setSelectedSite] = useState('')
  const [allClientRows, setAllClientRows] = useState<any[]>([])
  const [allDateRows, setAllDateRows] = useState<any[]>([])
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [selectPdfOpen, setSelectPdfOpen] = useState(false)
  const [selectedPdfClients, setSelectedPdfClients] = useState<Set<string>>(new Set())
  const [recipientName, setRecipientName] = useState('')
  const [siteName, setSiteName] = useState('')

  const [editRows, setEditRows] = useState<EditRow[]>([])
  // 배차내역서에서 넘어온 행 임시 보관 (load()가 덮어쓰기 전에 복원용)
  const fromDispatchRef = useRef<{ rows: EditRow[]; client: string } | null>(null)
  const loadingFromSavedRef = useRef<{ rows: EditRow[]; client: string; site: string } | null>(null)

  const [company, setCompany] = useState(DEFAULT_COMPANY)
  const [editingCompany, setEditingCompany] = useState(false)
  const [companyDraft, setCompanyDraft] = useState(DEFAULT_COMPANY)
  const [supplierList, setSupplierList] = useState<any[]>([])
  const [selectedSupId, setSelectedSupId] = useState<string>('')

  const [stampImg, setStampImg] = useState<string>('')
  const [stampSize, setStampSize] = useState(48)
  const [stampList, setStampList] = useState<{ name: string; data: string }[]>([])
  const [stampDropOpen, setStampDropOpen] = useState(false)
  const stampInputRef = useRef<HTMLInputElement>(null)
  const printAreaRef = useRef<HTMLDivElement>(null)
  const [docScale, setDocScale] = useState(1)
  useEffect(() => {
    const update = () => setDocScale(Math.min(1, (window.innerWidth - 32) / 900))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const [docHeight, setDocHeight] = useState(0)
  useEffect(() => {
    const el = printAreaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDocHeight(el.offsetHeight))
    ro.observe(el)
    setDocHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [])
  const [bankText, setBankText] = useState('')

  useEffect(() => {
    try {
      const c = DEFAULT_COMPANY
      setCompany(c)
      setBankText(`입금계좌 : ${c.bank.replace(/\s*예금주\s*[:：]?\s*.*/i, '').trim()}  예금주 : ${c.name}(${c.phone})`)
      // 마지막 선택 업체 복원 (회사정보 + 도장)
      const lastSupId = localStorage.getItem('ts_last_sup_id') ?? ''
      if (lastSupId) setSelectedSupId(lastSupId)
      const companyKey = lastSupId ? `ts_company_sup_${lastSupId}` : 'ts_company'
      const savedCompany = localStorage.getItem(companyKey) ?? localStorage.getItem('ts_company')
      if (savedCompany) {
        try {
          const parsed = JSON.parse(savedCompany)
          const cleanBank = (parsed.bank ?? '').replace(/\s*예금주\s*[:：]?\s*.*/i, '').trim()
          const cleanedParsed = { ...parsed, bank: cleanBank }
          setCompany(cleanedParsed)
          try { localStorage.setItem(companyKey, JSON.stringify(cleanedParsed)) } catch {}
          setBankText(`입금계좌 : ${cleanBank}  예금주 : ${parsed.name}(${parsed.phone})`)
        } catch {}
      }
      const stamp = lastSupId
        ? (localStorage.getItem(`ts_stamp_sup_${lastSupId}`) ?? localStorage.getItem('ts_stamp') ?? '')
        : (localStorage.getItem('ts_stamp') ?? '')
      if (stamp) setStampImg(stamp)
      const list = localStorage.getItem('ts_stamp_list')
      if (list) setStampList(JSON.parse(list))
      else if (stamp) {
        // 기존 단일 도장 → 목록으로 마이그레이션
        const migrated = [{ name: '도장1', data: stamp }]
        setStampList(migrated)
        localStorage.setItem('ts_stamp_list', JSON.stringify(migrated))
      }
      // 배차내역서에서 넘어온 행 — load()가 덮어쓰지 못하도록 ref에 보관
      const fromDispatch = localStorage.getItem('ts_from_dispatch')
      if (fromDispatch) {
        try {
          const parsed = JSON.parse(fromDispatch)
          localStorage.removeItem('ts_from_dispatch')
          fromDispatchRef.current = parsed
        } catch {}
      }
    } catch {
      setBankText(`입금계좌 : ${DEFAULT_COMPANY.bank}  예금주 : ${DEFAULT_COMPANY.name}(${DEFAULT_COMPANY.phone})`)
    }
    // DB에서 업체 목록 + 도장 동시 로드 (localStorage 유실 대비)
    supabase.from('suppliers').select('*').eq('status', 'active')
      .then(({ data }) => {
        const sorted = (data ?? []).sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko'))
        setSupplierList(sorted)
        const savedLastSupId = localStorage.getItem('ts_last_sup_id') ?? ''
        // lastSupId가 있으면 해당 업체 도장 우선
        const targetSup = savedLastSupId
          ? sorted.find((s: any) => s.id === savedLastSupId)
          : sorted[0]
        if (targetSup?.stamp_data) {
          setStampImg(targetSup.stamp_data)
          if (savedLastSupId) {
            try { localStorage.setItem(`ts_stamp_sup_${savedLastSupId}`, targetSup.stamp_data) } catch {}
          } else {
            // lastSupId가 없었으면 첫 업체로 자동 선택
            setSelectedSupId(targetSup.id)
            try { localStorage.setItem('ts_last_sup_id', targetSup.id) } catch {}
            try { localStorage.setItem(`ts_stamp_sup_${targetSup.id}`, targetSup.stamp_data) } catch {}
          }
        }
      })
    loadTsList()
  }, [])

  // 업체 변경 시 DB에서 해당 업체 정보 + 도장 직접 로드 (localStorage 오염 방지)
  useEffect(() => {
    if (!selectedSupId) return
    supabase.from('suppliers').select('*').eq('id', selectedSupId).single()
      .then(({ data }: { data: any }) => {
        if (!data) return
        const bankName = data.bank_name ?? ''
        const bankAccount = data.bank_account ?? ''
        const bankHolder = data.bank_holder || data.name || ''
        const bankBase = [bankName, bankAccount].filter(Boolean).join(' ')
        const bankStr = [bankName, bankAccount, bankHolder ? `예금주 : ${bankHolder}` : ''].filter(Boolean).join(' ')
        const c = {
          name: data.name ?? '',
          reg_no: data.business_no ?? '',
          ceo: data.ceo_name ?? '',
          address: data.address ?? '',
          biz_type: data.biz_type ?? '',
          biz_item: data.biz_item ?? '',
          bank: bankBase,
          phone: data.contact ?? '',
        }
        setCompany(c)
        setBankText(`입금계좌 : ${bankBase}  예금주 : ${bankHolder}(${data.contact ?? ''})`)
        // 업체별 로컬 캐시 갱신
        try { localStorage.setItem(`ts_company_sup_${selectedSupId}`, JSON.stringify(c)) } catch {}
        // 도장: 로컬 캐시 우선, 없으면 DB stamp_data
        const localStamp = localStorage.getItem(`ts_stamp_sup_${selectedSupId}`) ?? ''
        if (localStamp) {
          setStampImg(localStamp)
        } else if (data.stamp_data) {
          setStampImg(data.stamp_data)
          try { localStorage.setItem(`ts_stamp_sup_${selectedSupId}`, data.stamp_data) } catch {}
        } else {
          setStampImg('')
        }
      })
  }, [selectedSupId])

  function saveCompany() {
    setCompany(companyDraft)
    if (selectedSupId) {
      localStorage.setItem(`ts_company_sup_${selectedSupId}`, JSON.stringify(companyDraft))
    } else {
      localStorage.setItem('ts_company', JSON.stringify(companyDraft))
    }
    const _bankForDisplay = companyDraft.bank.replace(/예금주\s*[:：]?\s*.*/i, '').trim()
    setBankText(`입금계좌 : ${_bankForDisplay}  예금주 : ${companyDraft.name}(${companyDraft.phone})`)
    setEditingCompany(false)
  }

  // 거래명세서 목록 저장/불러오기
  const [tsSavedId, setTsSavedId] = useState('')
  const [tsSavedList, setTsSavedList] = useState<{ id: string; label: string }[]>([])

  async function loadTsList() {
    const { data, error } = await supabase.from('trade_statements').select('id, client_name, site_name, date_from, created_at').order('created_at', { ascending: false }).limit(60)
    if (error) { console.error('trade_statements 로드 오류:', error); return }
    if (data) setTsSavedList(data.map((d: any) => ({ id: d.id, label: `${(d.date_from ?? '').slice(0, 7)} ${d.client_name ?? ''} ${d.site_name ?? ''}`.trim() })))
  }

  async function loadTsRecord(id: string) {
    const { data } = await supabase.from('trade_statements').select('*').eq('id', id).single()
    if (!data) return
    const rows = data.rows ? (data.rows as any[]).map((r: any) => ({ ...r })) : []
    // ref에 미리 저장 → load() 가 dateFrom/dateTo 변경으로 재실행돼도 덮어쓰지 않음
    loadingFromSavedRef.current = {
      rows,
      client: data.client_name ?? '',
      site: data.site_name ?? '',
    }
    setTsSavedId(id)
    if (data.date_from) setDateFrom(data.date_from)
    if (data.date_to) setDateTo(data.date_to)
    // 날짜 변경이 없을 경우 load() 재실행 안 되므로 직접 세팅
    setRecipientName(data.client_name ?? '')
    setSiteName(data.site_name ?? '')
    setEditRows(rows)
  }

  const [savingCompany, setSavingCompany] = useState(false)
  async function handleSaveCompanyInline() {
    setSavingCompany(true)
    try {
      if (selectedSupId) {
        // 특정 업체용 키에만 저장 — 전역 ts_company를 덮어쓰면 다른 업체에 적용됨
        localStorage.setItem(`ts_company_sup_${selectedSupId}`, JSON.stringify(company))
        // 발주처-공급자 매핑 저장 (발주처 변경 시 공급자 복원용)
        if (selectedClient) localStorage.setItem(`ts_client_sup_${selectedClient}`, selectedSupId)
        const bankStr = company.bank ?? ''
        const spaceIdx = bankStr.indexOf(' ')
        const bankName = spaceIdx >= 0 ? bankStr.slice(0, spaceIdx) : bankStr
        const rest = spaceIdx >= 0 ? bankStr.slice(spaceIdx + 1).trim() : ''
        const holderMatch = rest.match(/예금주[:：]?\s*(.+)/)
        const bankHolder = holderMatch ? holderMatch[1].trim() : ''
        const bankAccount = holderMatch ? rest.slice(0, rest.indexOf(holderMatch[0])).trim() : rest
        await supabase.from('suppliers').update({
          name: company.name,
          ceo_name: company.ceo,
          business_no: company.reg_no,
          address: company.address,
          biz_type: company.biz_type,
          biz_item: company.biz_item,
          contact: company.phone,
          bank_name: bankName || null,
          bank_account: bankAccount || null,
          bank_holder: bankHolder || null,
        }).eq('id', selectedSupId)
      } else {
        // 업체 선택 안 된 경우에만 전역 키 저장
        localStorage.setItem('ts_company', JSON.stringify(company))
      }
      // 거래명세서 목록에도 저장
      const tsPayload = {
        client_name: recipientName,
        site_name: siteName,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        rows: editRows,
        supplier_id: selectedSupId || null,
      }
      if (tsSavedId) {
        const { error: updErr } = await supabase.from('trade_statements').update(tsPayload).eq('id', tsSavedId)
        if (updErr) { console.error('update 오류:', updErr); alert('저장 실패: ' + updErr.message); setSavingCompany(false); return }
      } else {
        const { data: tsData, error: insErr } = await supabase.from('trade_statements').insert(tsPayload).select('id').single()
        if (insErr) { console.error('insert 오류:', insErr); alert('저장 실패: ' + insErr.message); setSavingCompany(false); return }
        if (tsData?.id) setTsSavedId(tsData.id)
      }
      await loadTsList()
      alert('저장되었습니다.')
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    }
    setSavingCompany(false)
  }

  async function handleSaveJpg() {
    const el = printAreaRef.current
    if (!el) return
    try {
      const { toJpeg } = await import('html-to-image')

      // 캡처용 스타일 주입
      const captureStyle = document.createElement('style')
      captureStyle.id = 'jpg-capture-style'
      captureStyle.textContent = `
        .no-print { display: none !important; }
        .cell-row { background: #fff !important; background-color: #fff !important; }
        .cell-row:hover { background: #fff !important; background-color: #fff !important; }
        table { border-collapse: collapse !important; }
        table td, table th { border: 1px solid #ccc !important; }
      `
      document.head.appendChild(captureStyle)

      // zoom 리셋 (모바일에서 축소된 상태로 캡처되지 않도록)
      const origZoom = (el.style as any).zoom
      const origTransform = el.style.transform
      ;(el.style as any).zoom = '1'
      el.style.transform = 'none'

      // 문서 원래 너비(900px)로 캡처 - width 강제 변경 시 셀 밀림 발생
      const origW = el.style.width
      const origMW = el.style.maxWidth
      const origMH = el.style.minHeight
      el.style.width = '900px'
      el.style.maxWidth = '900px'
      el.style.minHeight = '1123px'

      // 강제 reflow — 도장 위치 확정
      void el.getBoundingClientRect()

      // 노란색 배경 흰색으로 교체
      const allEls = Array.from(el.querySelectorAll<HTMLElement>('*'))
      const origStyles: [HTMLElement, string, string][] = []
      allEls.forEach(e => {
        const computed = window.getComputedStyle(e).backgroundColor
        if (/^rgb\(255,\s*2[45]\d/.test(computed)) {
          origStyles.push([e, e.style.background, e.style.backgroundColor])
          e.style.setProperty('background', '#ffffff', 'important')
          e.style.setProperty('background-color', '#ffffff', 'important')
        }
      })

      // 이미지 로드 대기
      await Promise.all(
        Array.from(el.querySelectorAll('img')).map(img =>
          img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r })
        )
      )
      await new Promise(r => setTimeout(r, 500))

      const dataUrl = await toJpeg(el, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        width: 900,
        height: Math.max(1123, el.scrollHeight),
        style: { margin: '0' }
      })

      // 복원
      ;(el.style as any).zoom = origZoom
      el.style.transform = origTransform
      el.style.width = origW
      el.style.maxWidth = origMW
      el.style.minHeight = origMH
      origStyles.forEach(([e, bg, bgc]) => {
        e.style.background = bg
        e.style.backgroundColor = bgc
      })
      document.getElementById('jpg-capture-style')?.remove()

      const filename = `거래명세서_${recipientName || ''}${dateFrom ? '_' + dateFrom : ''}.jpg`

      // 바로 다운로드
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      alert('📥 이미지가 다운로드됐습니다.\n갤러리에서 카카오톡으로 공유하세요.')
    } catch (e) {
      alert('공유 실패: ' + String(e))
    }
  }

  async function handleDownloadAllPdf(filterClients?: string[]) {
    if (downloadingAll) return
    const allClients = [...new Set(allDateRows.map((r: any) => r.client_name).filter(Boolean))] as string[]
    const uniqueClients = filterClients ? allClients.filter(c => filterClients.includes(c)) : allClients
    if (uniqueClients.length === 0) return alert('데이터가 없습니다.')
    setDownloadingAll(true)

    try {
      const { toJpeg } = await import('html-to-image')
      const images: string[] = []

      const savedClient = selectedClient
      const savedRecipient = recipientName
      const savedSite = siteName
      const savedRows = [...editRows]

      for (let i = 0; i < uniqueClients.length; i++) {
        const client = uniqueClients[i]
        const clientRows = allDateRows.filter((r: any) => r.client_name === client)
        if (clientRows.length === 0) continue

        setSelectedClient(client)
        setRecipientName(client)
        setSiteName(clientRows[0]?.site_name ?? '')
        setEditRows(clientRows.map(({ client_name, site_name, ...rest }: any) => rest))

        await new Promise(r => setTimeout(r, 700))

        const el = printAreaRef.current
        if (!el) continue

        const captureStyle = document.createElement('style')
        captureStyle.id = 'all-pdf-capture-style'
        captureStyle.textContent = `.no-print{display:none!important}.cell-row{background:#fff!important}table{border-collapse:collapse!important}table td,table th{border:1px solid #ccc!important}`
        document.head.appendChild(captureStyle)

        const origZoom = (el.style as any).zoom
        const origTransform = el.style.transform
        const origW = el.style.width
        const origMW = el.style.maxWidth
        const origMH = el.style.minHeight
        ;(el.style as any).zoom = '1'
        el.style.transform = 'none'
        el.style.width = '900px'
        el.style.maxWidth = '900px'
        el.style.minHeight = '1123px'

        const allEls = Array.from(el.querySelectorAll<HTMLElement>('*'))
        const origStyles: [HTMLElement, string, string][] = []
        allEls.forEach(e => {
          const computed = window.getComputedStyle(e).backgroundColor
          if (/^rgb\(255,\s*2[45]\d/.test(computed)) {
            origStyles.push([e, e.style.background, e.style.backgroundColor])
            e.style.setProperty('background', '#ffffff', 'important')
            e.style.setProperty('background-color', '#ffffff', 'important')
          }
        })

        await new Promise(r => setTimeout(r, 200))

        const dataUrl = await toJpeg(el, {
          quality: 0.95, pixelRatio: 1.5, backgroundColor: '#ffffff',
          width: 900, height: Math.max(1123, el.scrollHeight),
          style: { margin: '0' }
        })
        // 즉시 다운로드 (팝업 없이)
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `거래명세서_${client}_${dateFrom}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        ;(el.style as any).zoom = origZoom
        el.style.transform = origTransform
        el.style.width = origW
        el.style.maxWidth = origMW
        el.style.minHeight = origMH
        origStyles.forEach(([e, bg, bgc]) => { e.style.background = bg; e.style.backgroundColor = bgc })
        document.getElementById('all-pdf-capture-style')?.remove()

        await new Promise(r => setTimeout(r, 150)) // 다운로드 간 딜레이
      }

      // Restore
      setSelectedClient(savedClient)
      setRecipientName(savedRecipient)
      setSiteName(savedSite)
      setEditRows(savedRows)
    } catch (e) {
      alert('PDF 생성 실패: ' + String(e))
    } finally {
      setDownloadingAll(false)
    }
  }

  function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const result = ev.target?.result as string
      const name = prompt('도장 이름을 입력하세요', `도장${stampList.length + 1}`) || `도장${stampList.length + 1}`
      const newList = [...stampList, { name, data: result }]
      setStampList(newList)
      setStampImg(result)
      try { localStorage.setItem('ts_stamp', result) } catch {}
      try { localStorage.setItem('ts_stamp_list', JSON.stringify(newList)) } catch {}
      if (selectedSupId) {
        try { localStorage.setItem(`ts_stamp_sup_${selectedSupId}`, result) } catch {}
        // DB에도 저장 (크로스디바이스 유실 방지)
        await supabase.from('suppliers').update({ stamp_data: result }).eq('id', selectedSupId)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function load() {
    setLoading(true)
    const [{ data, error }, { data: equipList }] = await Promise.all([
      supabase
        .from('daily_logs')
        .select(`*, dispatch:dispatches(*, equipment:equipment(type, plate_no, spec, model), supplier:suppliers(name))`)
        .gte('log_date', dateFrom)
        .lte('log_date', dateTo)
        .order('log_date', { ascending: true }),
      supabase.from('equipment').select('plate_no, type, spec, model'),
    ])

    if (error || !data) { setLoading(false); return }

    // 차량번호 → 장비정보 맵 (equipment_text 행 규격 보완용)
    const equipByPlate: Record<string, { type: string; spec: string }> = {}
    for (const e of (equipList ?? [])) {
      if (e.plate_no) equipByPlate[e.plate_no.replace(/\s/g, '')] = { type: e.type ?? '', spec: e.spec ?? e.model ?? '' }
    }

    const typeMap: Record<string, string> = { excavator: '굴삭기', dump: '덤프', cargo: '화물', truck: '화물' }
    function parseSlotHours(slot: string | null | undefined): number {
      if (!slot) return 0
      const m = slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
      if (!m) return 0
      const mins = (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2]))
      return Math.max(0, Math.round(mins / 60 * 10) / 10)
    }
    function mergeRows(rows: any[]): any[] {
      // 같은 배차(dispatch_id) 내에서 날짜 + 차번호 + 작업종류 + 단가가 같은 행은 시간 합산
      // dispatch_id를 포함해 다른 배차끼리 합산되는 문제 방지
      const map = new Map<string, any>()
      const order: string[] = []
      for (const r of rows) {
        const key = `${r.dispatch_id ?? r._key}|${r.log_date}|${r.plate_no}|${r.work_content}|${r.unit_price}`
        if (map.has(key)) {
          const existing = map.get(key)!
          const sum = Math.round((Number(existing.quantity) + Number(r.quantity)) * 10) / 10
          existing.quantity = String(sum)
        } else {
          map.set(key, { ...r })
          order.push(key)
        }
      }
      return order.map(k => map.get(k)!)
    }
    const rawRows = data.flatMap((log: any) => {
      const d = log.dispatch ?? {}
      const eq = d.equipment ?? {}
      const base = {
        dispatch_id: log.dispatch_id ?? d.id ?? '',
        log_date: log.log_date ?? '',
        equipment_type: (() => {
          if (eq.plate_no) return [typeMap[eq.type] ?? eq.type, eq.spec].filter(Boolean).join(' ')
          if (!d.equipment_text) return ''
          const parts = d.equipment_text.trim().split(/\s+/)
          const plate = parts.pop() ?? ''
          const looked = equipByPlate[plate.replace(/\s/g, '')]
          if (looked) return [typeMap[looked.type] ?? looked.type, looked.spec].filter(Boolean).join(' ')
          return parts.join(' ')
        })(),
        plate_no: eq.plate_no ?? (d.equipment_text ? d.equipment_text.trim().split(/\s+/).pop() ?? '' : ''),
        note: log.special_notes ?? log.note ?? '',
        client_name: (d as any).client_name ?? d.supplier?.name ?? '',
        site_name: (d as any).site_name ?? '',
      }
      // 작업 종류별 분리 (버켓/뿌레카/집게/기타) — work_time이 있는 경우만 별도 행
      if ((log.work_type_1 && log.work_time_1) || (log.work_type_2 && log.work_time_2)) {
        const rows = []
        if (log.work_type_1 && log.work_time_1) {
          const h = parseSlotHours(log.work_time_1)
          rows.push({ ...base, _key: log.id + '_1', work_content: log.work_type_1,
            quantity: String(h), unit_price: (log.work_price_1 ?? 0) > 0 ? Number(log.work_price_1).toLocaleString() : '' })
        }
        if (log.work_type_2 && log.work_time_2) {
          const h = parseSlotHours(log.work_time_2)
          rows.push({ ...base, _key: log.id + '_2', work_content: log.work_type_2,
            quantity: String(h), unit_price: (log.work_price_2 ?? 0) > 0 ? Number(log.work_price_2).toLocaleString() : '' })
        }
        if ((log as any).work_type_3 && (log as any).work_time_3) {
          const h = parseSlotHours((log as any).work_time_3)
          rows.push({ ...base, _key: log.id + '_3', work_content: (log as any).work_type_3,
            quantity: String(h), unit_price: ((log as any).work_price_3 ?? 0) > 0 ? Number((log as any).work_price_3).toLocaleString() : '' })
        }
        if (rows.length > 0) return rows
      }
      // 기존 방식 (단일 행) — work_type_1이 있으면 작업칸에 표시
      return [{
        ...base,
        _key: log.id,
        work_content: log.work_content || log.work_type_1 || '',
        quantity: String(log.quantity ?? 0),
        unit_price: (d.client_unit_price ?? 0) > 0 ? (d.client_unit_price ?? 0).toLocaleString() : '',
      }]
    })
    const allRows = mergeRows(rawRows)

    const uniqueClients = ([...new Set(allRows.map((r: any) => r.client_name).filter(Boolean))] as string[]).sort((a, b) => a.localeCompare(b, 'ko'))
    setClients(uniqueClients)
    setAllDateRows(allRows)

    const client = selectedClient || uniqueClients[0] || ''
    if (!selectedClient && client) setSelectedClient(client)

    const filtered = allRows.filter((r: any) => !client || r.client_name === client)
    const uniqueSites = ([...new Set(filtered.map((r: any) => r.site_name).filter(Boolean))] as string[]).sort((a, b) => a.localeCompare(b, 'ko'))
    setSites(uniqueSites)
    setAllClientRows(filtered)
    setSelectedSite('')
    // 저장된 거래명세서에서 불러온 데이터가 있으면 DB 행 대신 사용
    if (loadingFromSavedRef.current) {
      const { rows, client: savedClient, site: savedSite } = loadingFromSavedRef.current
      loadingFromSavedRef.current = null
      setEditRows(rows)
      if (savedClient) { setSelectedClient(savedClient); setRecipientName(savedClient) }
      if (savedSite) setSiteName(savedSite)
    // 배차내역서에서 넘어온 데이터가 있으면 DB 행 대신 사용
    } else if (fromDispatchRef.current) {
      const { rows, client: dispClient } = fromDispatchRef.current
      fromDispatchRef.current = null
      setEditRows(rows)
      if (dispClient) { setSelectedClient(dispClient); setRecipientName(dispClient) }
    } else {
      setEditRows(filtered.map(({ client_name, site_name, ...rest }: any) => rest))
      if (filtered.length > 0) {
        if (!recipientName) setRecipientName(client)
        if (!siteName) setSiteName((filtered[0] as any).site_name)
      }
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [dateFrom, dateTo])

  function applyClientFilter(client: string) {
    setSelectedClient(client)
    setRecipientName(client)
    // 발주처별 저장된 공급자 ID 복원 → useEffect([selectedSupId])가 DB에서 공급자 정보 로드
    if (client) {
      const savedSupForClient = localStorage.getItem(`ts_client_sup_${client}`)
      if (savedSupForClient) setSelectedSupId(savedSupForClient)
    }
    const filtered = allDateRows.filter((r: any) => !client || r.client_name === client)
    const uniqueSites = ([...new Set(filtered.map((r: any) => r.site_name).filter(Boolean))] as string[]).sort((a, b) => a.localeCompare(b, 'ko'))
    setSites(uniqueSites)
    setAllClientRows(filtered)
    setSelectedSite('')
    setEditRows(filtered.map(({ client_name, site_name, ...rest }: any) => rest))
    if (filtered.length > 0) setSiteName((filtered[0] as any).site_name)
  }

  function applySiteFilter(site: string) {
    setSelectedSite(site)
    const siteFiltered = site ? allClientRows.filter((r: any) => r.site_name === site) : allClientRows
    setEditRows(siteFiltered.map(({ client_name, site_name, ...rest }: any) => rest))
    setSiteName(site) // 전체 선택 시 빈값, 특정 현장 선택 시 해당 현장명
  }

  function updateRow(key: string, field: keyof EditRow, value: string) {
    setEditRows(rows => rows.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  function copyRow(key: string) {
    setEditRows(rows => {
      const idx = rows.findIndex(r => r._key === key)
      if (idx < 0) return rows
      const copy = { ...rows[idx], _key: Math.random().toString(36).slice(2) }
      const next = [...rows]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  function deleteRow(key: string) {
    setEditRows(rows => rows.filter(r => r._key !== key))
  }

  function addRow() {
    setEditRows(rows => [...rows, newBlankRow()])
  }

  const totalSupply = editRows.reduce((s, r) => s + calcRow(r).supply, 0)
  const totalVat = editRows.reduce((s, r) => s + calcRow(r).vat, 0)
  const totalAmount = totalSupply + totalVat

  const baseDateLabel = (() => {
    const d = new Date(dateTo)
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
  })()

  const cellInp = (val: string, onChange: (v: string) => void, style?: React.CSSProperties) => (
    <input
      value={val}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', border: 'none', background: 'transparent',
        textAlign: 'center', fontSize: 13, padding: '2px 2px',
        outline: 'none', ...style
      }}
    />
  )

  const inp = 'w-full px-2 py-1 border border-gray-300 rounded text-sm'

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          header { display: none !important; }
          nav { display: none !important; }
          body { background: white; }
          .print-area {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 900px !important;
            zoom: 0.79 !important;
            transform: none !important;
          }
          .cell-input { background: transparent !important; }
          .editable-cell { border: none !important; background: transparent !important; }
          .print-wrap { height: auto !important; overflow: visible !important; }
        }
        .print-area { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; }
        .cell-row:hover { background: #f0f7ff !important; }
      `}</style>

      {/* 컨트롤 */}
      <div className="no-print p-4 md:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">거래명세서</h1>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <span className="text-gray-400">~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <div className="flex rounded-lg overflow-hidden border border-indigo-400">
            <button onClick={() => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
              const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0')
              const last = new Date(y, d.getMonth()+1, 0).getDate()
              setDateFrom(`${y}-${m}-01`); setDateTo(`${y}-${m}-${String(last).padStart(2,'0')}`)
            }} className="px-3 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors font-medium border-r border-indigo-400">
              전월
            </button>
            <button onClick={() => {
              const now = new Date()
              const y = now.getFullYear(), m = now.getMonth() + 1
              // 전월 26일 ~ 당월 25일
              const prevY = m === 1 ? y - 1 : y
              const prevM = m === 1 ? 12 : m - 1
              setDateFrom(`${prevY}-${String(prevM).padStart(2,'0')}-26`)
              setDateTo(`${y}-${String(m).padStart(2,'0')}-25`)
            }} className="px-3 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors font-medium border-r border-indigo-400">
              25일
            </button>
            <button onClick={() => {
              const now = new Date()
              const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0')
              const last = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
              setDateFrom(`${y}-${m}-01`); setDateTo(`${y}-${m}-${String(last).padStart(2,'0')}`)
            }} className="px-3 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors font-medium">
              당월
            </button>
          </div>
          <select value={selectedClient} onChange={e => applyClientFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option value="">발주처 선택</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {sites.length > 1 && (
            <select value={selectedSite} onChange={e => applySiteFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">전체 현장</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button onClick={addRow}
            className="px-3 py-2 border border-dashed border-gray-400 text-gray-600 text-sm rounded-lg hover:bg-gray-50">
            + 행 추가
          </button>
          <button onClick={() => {
            const sup = supplierList.find((s: any) => s.name === '㈜가온건설중기' || s.name === '(주)가온건설중기')
            if (sup) {
              setSelectedSupId(sup.id)
              try { localStorage.setItem('ts_last_sup_id', sup.id) } catch {}
            } else {
              setSelectedSupId('')
              setCompany(DEFAULT_COMPANY)
              setBankText(`입금계좌 : ${DEFAULT_COMPANY.bank}  예금주 : ${DEFAULT_COMPANY.name}(${DEFAULT_COMPANY.phone})`)
            }
          }} className="no-print text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow bg-gray-600 hover:bg-gray-700 text-white">
            🏠 기본정보
          </button>
          <button onClick={() => setEditingCompany(true)}
            className="no-print text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow bg-purple-600 hover:bg-purple-700 text-white">
            ✏️ 회사 정보 수정
          </button>
          <button onClick={handleSaveCompanyInline} disabled={savingCompany}
            className="no-print text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white">
            💾 {savingCompany ? '저장 중...' : '저장반영'}
          </button>
          <select onChange={e => { if (e.target.value) loadTsRecord(e.target.value) }} value={tsSavedId}
            className="no-print text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[180px] truncate">
            <option value="">📂 저장된 명세서…</option>
            {tsSavedList.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {tsSavedId && (
            <button onClick={async () => {
              if (!confirm('이 거래명세서를 삭제할까요?')) return
              await supabase.from('trade_statements').delete().eq('id', tsSavedId)
              setTsSavedId('')
              await loadTsList()
            }} className="no-print text-xs px-2.5 py-1.5 rounded bg-red-500 text-white hover:bg-red-600">
              🗑 삭제
            </button>
          )}
          <button onClick={handleSaveJpg}
            className="no-print bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow">
            🖼 JPG 저장
          </button>
          <button onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            🖨️ 인쇄 / PDF
          </button>
          {clients.length > 0 && (
            <button onClick={() => { setSelectPdfOpen(v => !v); setSelectedPdfClients(new Set()) }}
              className={`px-4 py-2 text-sm rounded-lg flex items-center gap-1 transition-colors ${
                selectPdfOpen ? 'bg-indigo-600 text-white' : 'border border-indigo-400 text-indigo-600 hover:bg-indigo-50'
              }`}>
              ☑️ 선택 PDF
            </button>
          )}
        </div>

        {/* 선택 PDF 패널 */}
        {selectPdfOpen && (
          <div className="border border-indigo-200 bg-indigo-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-indigo-800">인쇄할 거래처 선택</p>
              <div className="flex gap-2">
                <button onClick={() => setSelectedPdfClients(new Set(clients))}
                  className="text-xs px-2 py-1 bg-white border border-indigo-300 rounded text-indigo-600 hover:bg-indigo-100">전체 선택</button>
                <button onClick={() => setSelectedPdfClients(new Set())}
                  className="text-xs px-2 py-1 bg-white border border-gray-300 rounded text-gray-500 hover:bg-gray-100">전체 해제</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {clients.map(c => {
                const isChecked = selectedPdfClients.has(c)
                return (
                  <button key={c} onClick={() => setSelectedPdfClients(prev => {
                    const next = new Set(prev)
                    isChecked ? next.delete(c) : next.add(c)
                    return next
                  })}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      isChecked ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                    }`}>
                    {isChecked ? '✓ ' : ''}{c}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => {
                if (selectedPdfClients.size === 0) return alert('거래처를 선택해주세요.')
                handleDownloadAllPdf([...selectedPdfClients])
                setSelectPdfOpen(false)
              }}
              disabled={downloadingAll || selectedPdfClients.size === 0}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-semibold rounded-lg transition-colors">
              {downloadingAll ? '⏳ 생성중...' : `📥 선택 PDF`}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 w-14 shrink-0">수신처</label>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500 w-14 shrink-0">현장명</label>
            {sites.length > 1 ? (
              <select value={siteName} onChange={e => applySiteFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48">
                <option value="">전체</option>
                {sites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input value={siteName} onChange={e => setSiteName(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-gray-500 shrink-0">도장</label>
            {stampImg ? (
              <>
                <img src={stampImg} alt="도장" style={{ width: stampSize, height: stampSize }} className="object-contain border border-gray-200 rounded" />
                <span className="text-xs text-gray-400">{stampList.find(s => s.data === stampImg)?.name ?? ''}</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">크기</span>
                  <input type="range" min={30} max={120} value={stampSize}
                    onChange={e => setStampSize(Number(e.target.value))}
                    className="w-20 accent-blue-600" />
                  <span className="text-xs text-gray-500 w-8">{stampSize}px</span>
                </div>
              </>
            ) : (
              <span className="text-xs text-gray-400">회사 정보 수정에서 관리</span>
            )}
            <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
          </div>
        </div>
<p className="text-xs text-gray-400">💡 표 안의 셀을 직접 클릭해서 수정 가능합니다. 복사/삭제 버튼은 인쇄 시 숨겨집니다.</p>
      </div>

      {/* 회사·장비 통합 모달 */}
      {editingCompany && (
        <SupplierEquipmentModal
          equipment={null}
          suppliers={supplierList}
          defaultSupplierId={selectedSupId}
          ownership="other"
          onClose={() => setEditingCompany(false)}
          onSaved={(companyInfo, supplierId) => {
            // 선택된 업체 ID 저장 (새로고침 시 복원용)
            const activeSupId = supplierId ?? selectedSupId
            if (companyInfo) {
              setCompany(companyInfo)
              // 업체 선택된 경우 업체별 키에만 저장 (전역 ts_company 오염 방지)
              if (activeSupId) {
                localStorage.setItem(`ts_company_sup_${activeSupId}`, JSON.stringify(companyInfo))
              } else {
                localStorage.setItem('ts_company', JSON.stringify(companyInfo))
              }
              setBankText(`입금계좌 : ${companyInfo.bank.replace(/\s*예금주\s*[:：]?\s*.*/i, '').trim()}  예금주 : ${companyInfo.name}(${companyInfo.phone})`)
            }
            if (activeSupId) {
              setSelectedSupId(activeSupId)
              localStorage.setItem('ts_last_sup_id', activeSupId)
              // 발주처-공급자 매핑 저장 (발주처 변경 시 공급자 복원용)
              if (selectedClient) localStorage.setItem(`ts_client_sup_${selectedClient}`, activeSupId)
            }
            // 도장: localStorage 우선, 없으면 DB에서 로드
            const localStamp = activeSupId ? (localStorage.getItem(`ts_stamp_sup_${activeSupId}`) ?? '') : ''
            if (localStamp) {
              setStampImg(localStamp)
            } else if (activeSupId) {
              supabase.from('suppliers').select('stamp_data').eq('id', activeSupId).single()
                .then(({ data }: { data: { stamp_data?: string | null } | null }) => {
                  const dbStamp = data?.stamp_data ?? ''
                  if (dbStamp) {
                    setStampImg(dbStamp)
                    try { localStorage.setItem(`ts_stamp_sup_${activeSupId}`, dbStamp) } catch {}
                  } else {
                    setStampImg('')
                  }
                })
            } else {
              setStampImg('')
            }
            try {
              const list = localStorage.getItem('ts_stamp_list')
              if (list) setStampList(JSON.parse(list))
            } catch {}
            setEditingCompany(false)
          }}
        />
      )}

      {/* 문서 */}
      <div className="print-wrap" style={{ height: docHeight > 0 && docScale < 1 ? docHeight * docScale : undefined, overflow: docScale < 1 ? 'hidden' : undefined }}>
        <div ref={printAreaRef} className="print-area"
          style={{ width: '900px', transform: docScale < 1 ? `scale(${docScale})` : undefined, transformOrigin: 'top left', paddingLeft: 16, paddingRight: 16, paddingBottom: 32 }}>
        {loading ? (
          <div className="no-print text-center py-16 text-gray-400">불러오는 중...</div>
        ) : (
          <div style={{ border: '2px solid #000', background: '#fff', marginTop: 12 }}>
            {/* 제목 */}
            <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 'bold', letterSpacing: 14, padding: '16px 0 10px', borderBottom: '2px solid #000' }}>
              거 래 명 세 서
            </div>

            {/* 기준일 + 공급자 세로 + 공급사 정보 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', borderBottom: '1px solid #000' }}>
              {/* 좌측: 공급받는자 정보 */}
              <div style={{ borderRight: '1px solid #ccc' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', borderBottom: '1px solid #ccc' }}>
                  <div style={{ padding: '5px 8px', borderRight: '1px solid #ccc', fontSize: 13, fontWeight: 'bold', background: '#f5f5f5' }}>기준일</div>
                  <div style={{ padding: '5px 8px', fontSize: 13 }}>{baseDateLabel}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid #ccc', gap: 4 }}>
                  <input className="editable-cell" value={recipientName}
                    onChange={e => setRecipientName(e.target.value)}
                    style={{ fontSize: 14, fontWeight: 'bold', border: 'none', outline: 'none', flex: 1, minWidth: 0, textAlign: 'right' }} />
                  <span className="no-print" style={{ fontSize: 10, color: '#ef4444', flexShrink: 0 }}>수정가능</span>
                  <span style={{ fontSize: 14, fontWeight: 'bold', flexShrink: 0 }}>귀하</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', borderBottom: '1px solid #ccc' }}>
                  <div style={{ padding: '5px 8px', borderRight: '1px solid #ccc', fontSize: 13, fontWeight: 'bold', background: '#f5f5f5' }}>현장명</div>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input className="editable-cell" value={siteName}
                      onChange={e => setSiteName(e.target.value)}
                      style={{ padding: '5px 8px', fontSize: 13, border: 'none', outline: 'none', flex: 1, minWidth: 0 }} />
                    <span className="no-print" style={{ fontSize: 10, color: '#ef4444', flexShrink: 0, paddingRight: 6 }}>수정가능</span>
                  </div>
                </div>
                <div style={{ padding: '6px 10px', fontSize: 14, fontWeight: '500' }}>
                  아래와 같이 청구합니다.
                </div>
              </div>
              {/* 가운데: 공급자 세로 레이블 */}
              <div style={{ borderRight: '1px solid #ccc', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 'bold', letterSpacing: 2, writingMode: 'vertical-rl', textOrientation: 'upright' }}>
                공급자
              </div>
              {/* 우측: 공급자 정보 */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', borderBottom: '1px solid #ccc' }}>
                  <div style={{ padding: '4px 8px', borderRight: '1px solid #ccc', fontSize: 12, fontWeight: 'bold', background: '#f5f5f5' }}>등록번호</div>
                  <input className="editable-cell" value={company.reg_no}
                    onChange={e => setCompany(c => ({ ...c, reg_no: e.target.value }))}
                    style={{ padding: '4px 8px', fontSize: 13, fontWeight: 'bold', letterSpacing: 1, border: 'none', outline: 'none', width: '100%', minWidth: 0 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', borderBottom: '1px solid #ccc' }}>
                  <div style={{ padding: '4px 8px', borderRight: '1px solid #ccc', fontSize: 12, fontWeight: 'bold', background: '#f5f5f5' }}>상호</div>
                  <div style={{ padding: '4px 8px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <input className="editable-cell" value={company.name}
                      onChange={e => setCompany(c => ({ ...c, name: e.target.value }))}
                      style={{ fontSize: 13, border: 'none', outline: 'none', flex: 1, minWidth: 0 }} />
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, borderLeft: '1px solid #ccc', paddingLeft: 8, paddingRight: 18, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#555' }}>대표</span>
                      <input className="editable-cell" value={company.ceo}
                        onChange={e => setCompany(c => ({ ...c, ceo: e.target.value }))}
                        style={{ fontSize: 13, fontWeight: 'bold', border: 'none', outline: 'none', width: 52, marginRight: 2 }} />
                      {stampImg && <img src={stampImg} alt="도장" style={{ position: 'absolute', right: 2, top: '50%', marginTop: -(stampSize / 2), width: stampSize, height: stampSize, objectFit: 'contain', opacity: 0.9, pointerEvents: 'none', zIndex: 10 }} />}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', borderBottom: '1px solid #ccc' }}>
                  <div style={{ padding: '4px 6px', borderRight: '1px solid #ccc', fontSize: 11, fontWeight: 'bold', background: '#f5f5f5', whiteSpace: 'nowrap' }}>사업장주소</div>
                  <input className="editable-cell" value={company.address}
                    onChange={e => setCompany(c => ({ ...c, address: e.target.value }))}
                    style={{ padding: '4px 8px', fontSize: 11, border: 'none', outline: 'none', width: '100%', minWidth: 0 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 40px 1fr', borderBottom: '1px solid #ccc' }}>
                  <div style={{ padding: '4px 8px', borderRight: '1px solid #ccc', fontSize: 12, fontWeight: 'bold', background: '#f5f5f5' }}>업태</div>
                  <input className="editable-cell" value={company.biz_type}
                    onChange={e => setCompany(c => ({ ...c, biz_type: e.target.value }))}
                    style={{ padding: '4px 8px', fontSize: 12, border: 'none', outline: 'none', borderRight: '1px solid #ccc', width: '100%', minWidth: 0 }} />
                  <div style={{ padding: '4px 6px', borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc', fontSize: 12, fontWeight: 'bold', background: '#f5f5f5', textAlign: 'center' }}>종목</div>
                  <input className="editable-cell" value={company.biz_item}
                    onChange={e => setCompany(c => ({ ...c, biz_item: e.target.value }))}
                    style={{ padding: '4px 8px', fontSize: 12, border: 'none', outline: 'none', width: '100%', minWidth: 0 }} />
                </div>
              </div>
            </div>

            {/* 합계금액 */}
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 180px', borderBottom: '1px solid #000', alignItems: 'center' }}>
              <div style={{ padding: '8px', fontSize: 13, fontWeight: 'bold', textAlign: 'center', background: '#f5f5f5', borderRight: '1px solid #ccc', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>합계금액</div>
              <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 'bold' }}>일금 {numToKorean(totalAmount)}</div>
              <div style={{ padding: '8px 12px', fontSize: 16, fontWeight: 'bold', textAlign: 'right', borderLeft: '1px solid #ccc' }}>₩{totalAmount.toLocaleString()}</div>
            </div>

            {/* 테이블 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f0f0f0', borderBottom: '1px solid #000' }}>
                  {['작업일', '구분', '차량번호', '작업', '시간', '단가', '공급가액', '세액', '비고'].map(h => (
                    <th key={h} style={{ padding: '6px 4px', borderRight: '1px solid #ccc', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                  <th className="no-print" style={{ padding: '4px', width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((r, i) => {
                  const { qty, price, supply, vat } = calcRow(r)
                  return (
                    <tr key={r._key} className="cell-row" style={{ borderBottom: '1px solid #ddd', background: i % 2 === 0 ? '#fff' : '#fafafa', height: 28 }}>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 60 }}>{cellInp(r.log_date, v => updateRow(r._key, 'log_date', v))}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 50 }}>{cellInp(r.equipment_type, v => updateRow(r._key, 'equipment_type', v))}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 60 }}>{cellInp(r.plate_no, v => updateRow(r._key, 'plate_no', v))}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 50 }}>{cellInp(r.work_content, v => updateRow(r._key, 'work_content', v))}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 36 }}>{cellInp(r.quantity, v => updateRow(r._key, 'quantity', v), { textAlign: 'center' })}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 46, maxWidth: 60 }}>{cellInp(r.unit_price, v => updateRow(r._key, 'unit_price', v), { textAlign: 'right' })}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 70, textAlign: 'right', padding: '3px 4px', fontWeight: 'bold' }}>{supply > 0 ? supply.toLocaleString() : ''}</td>
                      <td style={{ borderRight: '1px solid #eee', minWidth: 60, textAlign: 'right', padding: '3px 4px' }}>{vat > 0 ? vat.toLocaleString() : ''}</td>
                      <td style={{ minWidth: 50 }}>{cellInp(r.note, v => updateRow(r._key, 'note', v))}</td>
                      <td className="no-print" style={{ padding: '2px 4px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => copyRow(r._key)} title="복사"
                          style={{ fontSize: 11, padding: '1px 5px', marginRight: 2, border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer', background: '#f0f7ff' }}>복사</button>
                        <button onClick={() => deleteRow(r._key)} title="삭제"
                          style={{ fontSize: 11, padding: '1px 5px', border: '1px solid #fcc', borderRadius: 3, cursor: 'pointer', background: '#fff0f0', color: '#c00' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
                {Array.from({ length: Math.max(0, 8 - editRows.length) }).map((_, i) => (
                  <tr key={'e' + i} style={{ borderBottom: '1px solid #ddd', height: 26 }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: '2px 4px', borderRight: j < 8 ? '1px solid #eee' : undefined }}>&nbsp;</td>
                    ))}
                    <td className="no-print"></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fffde7', borderTop: '2px solid #000', fontWeight: 'bold' }}>
                  <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #ccc' }}>소 계</td>
                  <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #ccc' }}>
                    {editRows.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0)}
                        </td>
                  <td style={{ borderRight: '1px solid #ccc' }}></td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', borderRight: '1px solid #ccc', color: '#c00' }}>{totalSupply.toLocaleString()}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', borderRight: '1px solid #ccc', color: '#c00' }}>{totalVat.toLocaleString()}</td>
                  <td></td>
                  <td className="no-print"></td>
                </tr>
                <tr style={{ background: '#f5f5f5', borderTop: '1px solid #000', fontWeight: 'bold' }}>
                  <td colSpan={6} style={{ padding: '4px 8px', textAlign: 'left', borderRight: '1px solid #ccc', fontSize: 12 }}>
                    <input
                      value={bankText}
                      onChange={e => setBankText(e.target.value)}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12, fontWeight: 'bold', outline: 'none' }}
                    />
                  </td>
                  <td colSpan={2} style={{ padding: '8px', textAlign: 'right', borderRight: '1px solid #ccc', fontWeight: 'bold', color: '#c00', fontSize: 14 }}>합계: ₩{totalAmount.toLocaleString()}</td>
                  <td></td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>

            {/* 하단 정보 */}
            <div style={{ borderTop: '1px solid #000', padding: '8px 12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: '#666', whiteSpace: 'nowrap' }}>{company.name}</span>
            </div>
          </div>
        )}
        </div>
      </div>
    </>
  )
}
