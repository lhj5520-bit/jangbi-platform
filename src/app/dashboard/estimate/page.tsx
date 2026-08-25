'use client'
export const dynamic = 'force-dynamic'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const GAON = {
  biz_no: '315-81-39390',
  name: '㈜가온건설중기',
  ceo: '이현정',
  addr: '충청북도 청주시 흥덕구 옥산덕촌길 57-21',
  biz_type: '건설업',
  biz_item: '건설장비 운영업',
}

const TYPE_OPTIONS = ['굴삭기', '덤프트럭', '화물차', '기타']
const SPEC_OPTIONS: Record<string, string[]> = {
  '굴삭기':   ['03LC', '03W', '06W'],
  '덤프트럭': ['5D/T', '8D/T', '11D/T', '14D/T', '15D/T', '18D/T', '20D/T', '25D/T'],
  '화물차':   ['1T', '2.5T', '3.5T', '5T', '11T', '25T'],
  '기타':     [],
}
const UNIT_OPTIONS = ['시간', '일대', '월대', '식', '대', '회']

interface Row {
  id: number
  type: string
  spec: string
  unit: string
  unit_price: string
  note: string
}

let _rowId = 0
function newRow(): Row {
  return { id: ++_rowId, type: '', spec: '', unit: '', unit_price: '', note: '' }
}

const PRESET_ROWS: Omit<Row, 'id'>[] = [
  { type: '굴삭기', spec: '03LC', unit: '시간', unit_price: '', note: '유류비 포함(월 200시간 기준)' },
  { type: '굴삭기', spec: '03W', unit: '일대', unit_price: '', note: '' },
  { type: '굴삭기', spec: '06W', unit: '일대', unit_price: '', note: '' },
  { type: '덤프트럭', spec: '15D/T', unit: '일대', unit_price: '', note: '' },
]

function initRows(): Row[] {
  const rows = PRESET_ROWS.map(r => ({ ...r, id: ++_rowId }))
  while (rows.length < 12) rows.push(newRow())
  return rows
}

const cTh: React.CSSProperties = {
  border: '1px solid #aaa', padding: '4px 6px', fontSize: 11,
  background: '#e8f4f8', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap',
}
const cTd: React.CSSProperties = {
  border: '1px solid #aaa', padding: '3px 4px', fontSize: 11,
}
const cInp: React.CSSProperties = {
  width: '100%', minWidth: 0, border: 'none', background: 'transparent',
  fontSize: 11, outline: 'none', textAlign: 'center',
}

export default function EstimatePage() {
  const supabase = createClient()
  const printAreaRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  const [year, setYear] = useState(String(today.getFullYear()))
  const [month, setMonth] = useState(String(today.getMonth() + 1))
  const [day, setDay] = useState(String(today.getDate()))
  const [receiver, setReceiver] = useState('')
  const [siteName, setSiteName] = useState('')
  const [rows, setRows] = useState<Row[]>(initRows)
  const [stampImg, setStampImg] = useState<string>('')
  const [stampList, setStampList] = useState<{ name: string; data: string }[]>([])
  const [stampSize, setStampSize] = useState(40)
  const [stampOpen, setStampOpen] = useState(false)
  const stampInputRef = useRef<HTMLInputElement>(null)
  const [docScale, setDocScale] = useState(1)
  const [docHeight, setDocHeight] = useState(0)

  // 저장/불러오기
  const [savedId, setSavedId] = useState('')
  const [savedList, setSavedList] = useState<{ id: string; label: string }[]>([])

  async function loadSavedList() {
    const { data } = await supabase.from('estimates').select('id, receiver, site_name, created_at').order('created_at', { ascending: false }).limit(50)
    if (data) setSavedList(data.map((d: any) => ({ id: d.id, label: `${(d.created_at ?? '').slice(0, 10)} ${d.receiver ?? ''} ${d.site_name ?? ''}`.trim() })))
  }

  async function saveEstimate() {
    const payload = { receiver, site_name: siteName, year, month, day, rows: rows.map(({ id: _, ...r }) => r) }
    if (savedId) {
      await supabase.from('estimates').update(payload).eq('id', savedId)
      alert('저장되었습니다.')
    } else {
      const { data, error } = await supabase.from('estimates').insert(payload).select('id').single()
      if (error) { alert('저장 실패: ' + error.message); return }
      setSavedId(data.id)
      await loadSavedList()
      alert('저장되었습니다.')
    }
  }

  async function loadEstimate(id: string) {
    const { data } = await supabase.from('estimates').select('*').eq('id', id).single()
    if (!data) return
    setReceiver(data.receiver ?? '')
    setSiteName(data.site_name ?? '')
    setYear(data.year ?? String(new Date().getFullYear()))
    setMonth(data.month ?? String(new Date().getMonth() + 1))
    setDay(data.day ?? String(new Date().getDate()))
    const loaded: Row[] = (data.rows ?? []).map((r: any) => ({ ...r, id: ++_rowId }))
    while (loaded.length < 12) loaded.push(newRow())
    setRows(loaded)
    setSavedId(id)
  }

  async function deleteEstimate() {
    if (!savedId) return
    if (!confirm('이 견적서를 삭제할까요?')) return
    await supabase.from('estimates').delete().eq('id', savedId)
    setSavedId('')
    setRows(initRows())
    setReceiver('')
    setSiteName('')
    await loadSavedList()
  }

  // 클라이언트 목록
  const [clients, setClients] = useState<string[]>([])

  useEffect(() => {
    const stamp = localStorage.getItem('ts_stamp') ?? ''
    setStampImg(stamp)
    const savedSize = Number(localStorage.getItem('estimate_stamp_size'))
    if (savedSize) setStampSize(savedSize)
    // 거래명세서와 같은 ts_stamp_list를 공유해 도장을 한 번만 등록하면 양쪽에서 쓸 수 있게 한다
    const raw = localStorage.getItem('ts_stamp_list')
    if (raw) {
      try { setStampList(JSON.parse(raw)) } catch {}
    } else if (stamp) {
      setStampList([{ name: '도장1', data: stamp }])
    }
    supabase.from('clients').select('name').then(({ data }: { data: any[] | null }) => {
      setClients((data ?? []).map((c: any) => c.name).filter(Boolean).sort())
    })
    loadSavedList()
  }, [])

  // 견적서는 가온 명의 문서라 글로벌 도장(ts_stamp)만 쓴다.
  // 업체별 도장(ts_stamp_sup_*)이나 suppliers.stamp_data는 절대 건드리지 않는다.
  function handleStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const result = ev.target?.result as string
      if (!result) return
      const name = prompt('도장 이름을 입력하세요', `도장${stampList.length + 1}`) || `도장${stampList.length + 1}`
      const newList = [...stampList, { name, data: result }]
      setStampList(newList)
      setStampImg(result)
      try {
        localStorage.setItem('ts_stamp', result)
        localStorage.setItem('ts_stamp_list', JSON.stringify(newList))
      } catch {}
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function selectStamp(data: string) {
    setStampImg(data)
    try { localStorage.setItem('ts_stamp', data) } catch {}
    setStampOpen(false)
  }

  function removeStamp(idx: number) {
    const target = stampList[idx]
    if (!confirm(`'${target.name}' 도장을 목록에서 삭제할까요?`)) return
    const newList = stampList.filter((_, i) => i !== idx)
    setStampList(newList)
    try { localStorage.setItem('ts_stamp_list', JSON.stringify(newList)) } catch {}
    if (stampImg === target.data) {
      setStampImg('')
      try { localStorage.removeItem('ts_stamp') } catch {}
    }
  }

  function changeStampSize(size: number) {
    setStampSize(size)
    try { localStorage.setItem('estimate_stamp_size', String(size)) } catch {}
  }

  useEffect(() => {
    const update = () => setDocScale(Math.min(1, (window.innerWidth - 32) / 780))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const el = printAreaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDocHeight(el.offsetHeight))
    ro.observe(el)
    setDocHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [rows])

  function updateRow(id: number, field: keyof Row, value: string) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const next = { ...r, [field]: value }
      if (field === 'type') next.spec = ''
      return next
    }))
  }

  function addRow() {
    setRows(prev => [...prev, newRow()])
  }

  function removeRow(id: number) {
    setRows(prev => prev.map(r => r.id === id ? { ...newRow(), id: r.id } : r))
  }

  function handlePrint() {
    window.print()
  }

  async function handleJpg() {
    const el = printAreaRef.current
    if (!el) return
    try {
      const prevTransform = el.style.transform
      const prevWidth = el.style.width
      el.style.transform = 'none'
      el.style.width = '780px'
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const { toJpeg } = await import('html-to-image')
      const dataUrl = await toJpeg(el, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: 2 })
      el.style.transform = prevTransform
      el.style.width = prevWidth

      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const filename = `견적서_${receiver || '미입력'}_${year}${month.padStart(2,'0')}${day.padStart(2,'0')}.jpg`
      const file = new File([blob], filename, { type: 'image/jpeg' })

      // 1순위: Web Share (카카오톡 등)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '견적서' })
          return
        } catch {}
      }

      // 2순위: 클립보드 PNG
      try {
        const img = new Image()
        img.src = dataUrl
        await new Promise(r => { img.onload = r })
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        const png = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        alert('✅ 클립보드에 복사됐습니다!\n카카오톡 채팅창에서 붙여넣기 하세요.')
        return
      } catch {}

      // 3순위: 다운로드
      const link = document.createElement('a')
      link.href = dataUrl; link.download = filename
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
      alert('📥 이미지가 다운로드됐습니다.')
    } catch (e) {
      alert('내보내기 실패: ' + String(e))
    }
  }

  const supplyTotal = rows.reduce((s, r) => s + (Number(r.unit_price) || 0), 0)

  return (
    <div className="min-h-screen bg-[#f3f0ea]">
      {/* 툴바 */}
      <div className="no-print sticky top-0 z-30 flex flex-wrap gap-2 items-center bg-white border-b border-gray-200 px-3 py-2.5 shadow-sm">
        <div className="flex gap-1.5 flex-wrap items-center">
          <button onClick={addRow}
            className="text-xs px-2.5 py-1.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">
            + 줄 추가
          </button>
          <button onClick={handlePrint}
            className="text-xs px-2.5 py-1.5 rounded bg-gray-700 text-white">
            📄 PDF 저장
          </button>
          <button onClick={handleJpg}
            className="text-xs px-2.5 py-1.5 rounded bg-green-600 text-white">
            📷 JPG / 카톡
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <select onChange={e => { if (e.target.value) loadEstimate(e.target.value) }} value={savedId}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[180px] truncate">
            <option value="">📂 저장된 견적서…</option>
            {savedList.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button onClick={saveEstimate}
            className="text-xs px-2.5 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
            💾 저장
          </button>
          {savedId && (
            <button onClick={deleteEstimate}
              className="text-xs px-2.5 py-1.5 rounded bg-red-500 text-white hover:bg-red-600">
              🗑 삭제
            </button>
          )}
        </div>

        {/* 도장 등록 */}
        <div className="relative flex items-center gap-2">
          <button onClick={() => setStampOpen(o => !o)}
            className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
            {stampImg
              ? <img src={stampImg} alt="" className="h-5 w-5 object-contain" />
              : <span className="text-gray-400">○</span>}
            도장 {stampImg ? '변경' : '등록'} ▾
          </button>

          {stampImg && (
            <div className="hidden items-center gap-1 sm:flex">
              <span className="text-xs text-gray-400">크기</span>
              <input type="range" min={24} max={100} value={stampSize}
                onChange={e => changeStampSize(Number(e.target.value))}
                className="w-20 accent-blue-600" />
              <span className="w-9 text-xs text-gray-500">{stampSize}px</span>
            </div>
          )}

          {stampOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setStampOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 w-60 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                <div className="mb-1 px-1 text-[11px] font-semibold text-gray-400">등록된 도장</div>
                {stampList.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-gray-400">등록된 도장이 없습니다.</p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {stampList.map((s, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded px-1.5 py-1 ${s.data === stampImg ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <button onClick={() => selectStamp(s.data)} className="flex min-w-0 flex-1 items-center gap-2">
                          <img src={s.data} alt="" className="h-8 w-8 shrink-0 rounded border border-gray-200 object-contain" />
                          <span className="truncate text-xs text-gray-700">{s.name}</span>
                          {s.data === stampImg && <span className="ml-auto shrink-0 text-[11px] font-semibold text-blue-600">사용중</span>}
                        </button>
                        <button onClick={() => removeStamp(i)} className="shrink-0 px-1 text-xs text-gray-300 hover:text-red-500">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2">
                  <button onClick={() => stampInputRef.current?.click()}
                    className="flex-1 rounded bg-blue-600 px-2 py-2 text-xs font-semibold text-white">
                    + 새 도장 등록
                  </button>
                  {stampImg && (
                    <button onClick={() => { setStampImg(''); try { localStorage.removeItem('ts_stamp') } catch {}; setStampOpen(false) }}
                      className="rounded border border-gray-200 px-2 py-2 text-xs text-gray-500">
                      도장 빼기
                    </button>
                  )}
                </div>
                <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-gray-400">
                  거래명세서와 도장 목록을 공유합니다.
                </p>
              </div>
            </>
          )}
          <input ref={stampInputRef} type="file" accept="image/*" className="hidden" onChange={handleStampUpload} />
        </div>
      </div>

      {/* 문서 래퍼 */}
      <div className="p-4">
        <div className="print-area-wrapper" style={{ height: docHeight * docScale + 16 }}>
          <div ref={printAreaRef} className="print-doc"
            style={{ transform: `scale(${docScale})`, transformOrigin: 'top left', width: 780 }}>

            <div style={{
              background: '#fff', padding: '32px 36px',
              fontFamily: 'AppleSDGothicNeo, "Malgun Gothic", "맑은 고딕", sans-serif',
            }}>
              {/* 제목 */}
              <div style={{ textAlign: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '0.3em', marginBottom: 20 }}>
                견  적  서
              </div>

              {/* 상단 정보 */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
                <tbody>
                  <tr>
                    {/* 좌측: 견적일 */}
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, width: '12%', background: '#e8f4f8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      견 적 일
                    </td>
                    <td colSpan={2} style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11, width: '28%' }}>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input value={year} onChange={e => setYear(e.target.value)} style={{ ...cInp, width: 36, textAlign: 'right' }} />년
                        <input value={month} onChange={e => setMonth(e.target.value)} style={{ ...cInp, width: 24, textAlign: 'right' }} />월
                        <input value={day} onChange={e => setDay(e.target.value)} style={{ ...cInp, width: 20, textAlign: 'right' }} />일
                      </span>
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, whiteSpace: 'nowrap', width: '10%' }}>
                      등록번호
                    </td>
                    <td colSpan={2} style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>
                      {GAON.biz_no}
                    </td>
                  </tr>
                  <tr>
                    <td rowSpan={3} style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, textAlign: 'center', verticalAlign: 'middle' }}>
                      공<br/>급<br/>받<br/>는<br/>자
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input list="client-list" value={receiver} onChange={e => setReceiver(e.target.value)}
                          placeholder="발주처명" style={{ ...cInp, textAlign: 'left', flex: 1 }} />
                        <span style={{ whiteSpace: 'nowrap' }}>귀하</span>
                      </span>
                      <datalist id="client-list">
                        {clients.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </td>
                    <td rowSpan={3} style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, textAlign: 'center', verticalAlign: 'middle', width: '6%' }}>
                      공<br/>급<br/>자
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      상 호
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11, width: '18%' }}>
                      {GAON.name}
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11, width: '16%', position: 'relative' }}>
                      <span style={{ fontSize: 10, color: '#555' }}>대표</span>{' '}{GAON.ceo}
                      {stampImg && (
                        <img src={stampImg} alt="도장"
                          style={{ position: 'absolute', right: 2, top: '50%', marginTop: -(stampSize / 2), width: stampSize, height: stampSize, objectFit: 'contain', zIndex: 10, opacity: 0.85, pointerEvents: 'none' }} />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11 }}>
                      <span style={{ fontSize: 10, color: '#666' }}>현장명</span>{' '}
                      <input value={siteName} onChange={e => setSiteName(e.target.value)}
                        placeholder="현장명 입력" style={{ ...cInp, textAlign: 'left', width: '80%' }} />
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      사업장소
                    </td>
                    <td colSpan={2} style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 10, color: '#333' }}>
                      {GAON.addr}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600 }}>
                      아래와 같이 견적합니다.
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      업태
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11 }}>
                      {GAON.biz_type}
                    </td>
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11 }}>
                      <span style={{ fontSize: 10, color: '#555' }}>종목</span>{' '}{GAON.biz_item}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 품목 테이블 */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 0 }}>
                <thead>
                  <tr>
                    <th style={{ ...cTh, width: '14%' }}>종류</th>
                    <th style={{ ...cTh, width: '12%' }}>규격</th>
                    <th style={{ ...cTh, width: '10%' }}>단위</th>
                    <th style={{ ...cTh, width: '16%' }}>단가</th>
                    <th style={{ ...cTh, width: '16%' }}>공급가액</th>
                    <th style={{ ...cTh }}>비고</th>
                    <th style={{ ...cTh, width: 24, background: '#f9f9f9' }} className="no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...cTd, textAlign: 'center' }}>
                        <select value={r.type} onChange={e => updateRow(r.id, 'type', e.target.value)}
                          className="no-print" style={{ ...cInp, cursor: 'pointer' }}>
                          <option value=""></option>
                          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span className="print-only" style={{ fontSize: 11 }}>{r.type}</span>
                      </td>
                      <td style={{ ...cTd, textAlign: 'center' }}>
                        {(!r.type || r.type === '기타') ? (
                          <>
                            <input value={r.spec} onChange={e => updateRow(r.id, 'spec', e.target.value)}
                              className="no-print" style={cInp} placeholder="직접 입력" />
                            <span className="print-only" style={{ fontSize: 11 }}>{r.spec}</span>
                          </>
                        ) : (
                          <>
                            <select value={r.spec} onChange={e => updateRow(r.id, 'spec', e.target.value)}
                              className="no-print" style={{ ...cInp, cursor: 'pointer' }}>
                              <option value=""></option>
                              {(SPEC_OPTIONS[r.type] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <span className="print-only" style={{ fontSize: 11 }}>{r.spec}</span>
                          </>
                        )}
                      </td>
                      <td style={{ ...cTd, textAlign: 'center' }}>
                        <select value={r.unit} onChange={e => updateRow(r.id, 'unit', e.target.value)}
                          className="no-print" style={{ ...cInp, cursor: 'pointer' }}>
                          <option value=""></option>
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        <span className="print-only" style={{ fontSize: 11 }}>{r.unit}</span>
                      </td>
                      <td style={cTd}>
                        <input type="text" inputMode="numeric" value={r.unit_price ? Number(r.unit_price).toLocaleString() : ''}
                          onChange={e => updateRow(r.id, 'unit_price', e.target.value.replace(/,/g, ''))}
                          style={{ ...cInp, textAlign: 'right' }} />
                      </td>
                      <td style={{ ...cTd, textAlign: 'right' }}>
                        {r.unit_price ? Number(r.unit_price).toLocaleString() : ''}
                      </td>
                      <td style={cTd}>
                        <input value={r.note} onChange={e => updateRow(r.id, 'note', e.target.value)} style={{ ...cInp, textAlign: 'left' }} />
                      </td>
                      <td style={{ ...cTd, textAlign: 'center', padding: 0 }} className="no-print">
                        <button onClick={() => removeRow(r.id)}
                          style={{ fontSize: 10, color: '#999', cursor: 'pointer', background: 'none', border: 'none', padding: '2px 4px' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {/* 합계 */}
                  <tr>
                    <td colSpan={3} style={{ ...cTd, background: '#e8f4f8', fontWeight: 700, textAlign: 'center', fontSize: 12 }}>합  계</td>
                    <td style={{ ...cTd, background: '#e8f4f8' }}></td>
                    <td style={{ ...cTd, background: '#e8f4f8', fontWeight: 700, textAlign: 'right', fontSize: 12 }}>
                      {supplyTotal > 0 ? supplyTotal.toLocaleString() : ''}
                    </td>
                    <td colSpan={2} style={{ ...cTd, background: '#e8f4f8' }}></td>
                  </tr>
                </tbody>
              </table>

              {/* 하단 비고 */}
              <div style={{ marginTop: 10, fontSize: 10, color: '#555' }}>
                비 고 : 견적 유효기간 30일
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: inline !important; }
          header, nav, aside { display: none !important; }
          body, html { margin: 0; padding: 0; background: #fff; overflow: visible !important; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          main, .flex-1 { overflow: visible !important; height: auto !important; }
          ::-webkit-scrollbar { display: none !important; }
          .print-area-wrapper { height: auto !important; overflow: visible !important; }
          .print-doc { transform: none !important; width: 186mm !important; }
        }
      `}</style>
    </div>
  )
}
