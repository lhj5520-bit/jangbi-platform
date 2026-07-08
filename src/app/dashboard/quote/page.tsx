'use client'
export const dynamic = 'force-dynamic'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const GAON = {
  name: '㈜가온건설중기',
  biz_no: '315-81-39390',
  ceo: '이현정',
  addr: '청주시 흥덕구 옥산면 오산덕촌길 57-21',
  biz_type: '건설업',
  biz_item: '건설장비 운영업',
}

const TYPE_OPTIONS = ['굴삭기', '덤프트럭', '화물차', '기타']

const SPEC_OPTIONS: Record<string, string[]> = {
  '굴삭기': ['01', '02', '03LC', '03W', '04W', '05W', '06W', '07W', '08W'],
  '덤프트럭': ['5D/T', '8D/T', '11D/T', '14D/T', '15D/T', '18D/T', '20D/T', '25D/T'],
  '화물차': ['1T', '2.5T', '3.5T', '5T', '11T', '25T'],
  '기타': [],
}

const UNIT_OPTIONS = ['시간', '일대', '월대', '식', '대', '회']

interface QuoteRow {
  type: string
  spec: string
  unit: string
  unit_price: string
  note: string
}

const EMPTY_ROW = (): QuoteRow => ({ type: '', spec: '', unit: '시간', unit_price: '', note: '' })
const INIT_ROWS: QuoteRow[] = Array.from({ length: 12 }, EMPTY_ROW)

const cTd: React.CSSProperties = { border: '1px solid #555', padding: '3px 5px', fontSize: 11, verticalAlign: 'middle' }
const cTh: React.CSSProperties = { border: '1px solid #555', padding: '4px 5px', fontSize: 11, fontWeight: 700, background: '#e8f4e8', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }
const cInp: React.CSSProperties = { border: 'none', outline: 'none', width: '100%', minWidth: 0, fontSize: 11, fontFamily: 'inherit', background: 'transparent', padding: 0 }
const cSel: React.CSSProperties = { border: 'none', outline: 'none', width: '100%', minWidth: 0, fontSize: 11, fontFamily: 'inherit', background: 'transparent', padding: 0, cursor: 'pointer' }

export default function QuotePage() {
  const supabase = createClient()
  const printAreaRef = useRef<HTMLDivElement>(null)

  const [clients, setClients] = useState<any[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [stampImg, setStampImg] = useState('')

  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10))
  const [clientName, setClientName] = useState('')
  const [siteName, setSiteName] = useState('')
  const [rows, setRows] = useState<QuoteRow[]>(INIT_ROWS)
  const [validDays, setValidDays] = useState('30')
  const [extraNote, setExtraNote] = useState('')

  const [docScale, setDocScale] = useState(1)
  const [docHeight, setDocHeight] = useState(0)

  useEffect(() => {
    const update = () => setDocScale(Math.min(1, (window.innerWidth - 32) / 800))
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
  }, [rows, quoteDate, clientName, siteName])

  useEffect(() => {
    supabase.from('clients').select('*').order('name').then(({ data }) => setClients(data ?? []))
    // 가온 도장
    const saved = localStorage.getItem('ts_stamp_gaon')
    if (saved) setStampImg(saved)
  }, [])

  useEffect(() => {
    if (!selectedClientId) return
    const c = clients.find(c => c.id === selectedClientId)
    if (c) setClientName(c.name)
  }, [selectedClientId, clients])

  function updateRow(idx: number, field: keyof QuoteRow, value: string) {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const next = { ...r, [field]: value }
      // 종별 바뀌면 규격 초기화
      if (field === 'type') next.spec = ''
      return next
    }))
  }

  function addRow() {
    setRows(prev => [...prev, EMPTY_ROW()])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  function handlePrint() {
    window.print()
  }

  async function handleJpg() {
    const el = printAreaRef.current
    if (!el) return
    try {
      const { toJpeg } = await import('html-to-image')
      const prev = el.style.transform
      el.style.transform = 'none'
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const dataUrl = await toJpeg(el, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: 2 })
      el.style.transform = prev
      const filename = `견적서_${clientName || '미입력'}_${quoteDate}.jpg`
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'image/jpeg' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '견적서' })
        return
      }
      try {
        const canvas = document.createElement('canvas')
        const img = new Image()
        await new Promise(r => { img.onload = r; img.src = dataUrl })
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        const png = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        alert('✅ 클립보드에 복사됐습니다!')
        return
      } catch {}
      const link = document.createElement('a')
      link.href = dataUrl; link.download = filename
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
    } catch (e) { alert('저장 실패: ' + String(e)) }
  }

  const fmtPrice = (v: string) => { const n = v.replace(/[^\d]/g, ''); return n ? Number(n).toLocaleString() : '' }

  // 공급가액 계산 (단가 입력 시)
  const supplyAmt = (r: QuoteRow) => {
    const p = Number(r.unit_price.replace(/[^\d]/g, ''))
    return p > 0 ? p.toLocaleString() : ''
  }

  const totalSupply = rows.reduce((s, r) => {
    const p = Number(r.unit_price.replace(/[^\d]/g, ''))
    return s + (p > 0 ? p : 0)
  }, 0)

  return (
    <div className="min-h-screen bg-[#f3f0ea]">
      {/* ── 툴바 ── */}
      <div className="no-print sticky top-0 z-30 flex flex-wrap gap-2 items-center bg-white border-b border-gray-200 px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[160px] truncate">
            <option value="">발주처 선택…</option>
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={clientName} onChange={e => setClientName(e.target.value)}
            placeholder="발주처 직접 입력"
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white w-36" />
          <input value={siteName} onChange={e => setSiteName(e.target.value)}
            placeholder="현장명"
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white w-36" />
        </div>
        <div className="flex gap-1.5">
          <button onClick={addRow}
            className="text-xs px-2.5 py-1.5 rounded border border-gray-300 bg-white text-gray-600">
            + 행 추가
          </button>
          <button onClick={handlePrint}
            className="text-xs px-2.5 py-1.5 rounded bg-gray-700 text-white">
            📄 PDF 저장
          </button>
          <button onClick={handleJpg}
            className="text-xs px-2.5 py-1.5 rounded bg-green-600 text-white">
            📷 JPG
          </button>
        </div>
      </div>

      {/* ── 문서 영역 ── */}
      <div className="p-4">
        <div className="print-area-wrapper" style={{ height: docHeight * docScale + 16 }}>
          <div ref={printAreaRef} className="print-doc"
            style={{ transform: `scale(${docScale})`, transformOrigin: 'top left', width: 800 }}>

            <div style={{
              background: '#fff', padding: '40px 48px', minHeight: 1050,
              fontFamily: 'AppleSDGothicNeo, "Malgun Gothic", "맑은 고딕", sans-serif',
            }}>

              {/* 제목 */}
              <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 900, letterSpacing: '0.5em', marginBottom: 20 }}>
                견 &nbsp; 적 &nbsp; 서
              </div>

              {/* 상단 정보 테이블 */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                <tbody>
                  <tr>
                    {/* 왼쪽: 견적일, 현장명 */}
                    <td style={{ width: '48%', verticalAlign: 'top', paddingRight: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr>
                            <td style={{ ...cTd, width: 70, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>견적일</td>
                            <td style={cTd}>
                              <input value={quoteDate} onChange={e => setQuoteDate(e.target.value)}
                                type="date" style={cInp} />
                            </td>
                          </tr>
                          <tr>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>현장명</td>
                            <td style={cTd}>
                              <input value={siteName} onChange={e => setSiteName(e.target.value)}
                                style={cInp} placeholder="현장명 입력" />
                            </td>
                          </tr>
                          <tr>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>귀하</td>
                            <td style={cTd}>
                              <input value={clientName} onChange={e => setClientName(e.target.value)}
                                style={cInp} placeholder="업체명 입력" />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>

                    {/* 오른쪽: 공급자 정보 */}
                    <td style={{ width: '52%', verticalAlign: 'top' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr>
                            <td colSpan={4} style={{ ...cTd, background: '#e8f4e8', fontWeight: 700, textAlign: 'center', fontSize: 12 }}>공급자</td>
                          </tr>
                          <tr>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center', width: 60 }}>상호</td>
                            <td style={cTd}>{GAON.name}</td>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center', width: 40 }}>대표</td>
                            <td style={{ ...cTd, position: 'relative', width: 80 }}>
                              {GAON.ceo}
                              {stampImg && (
                                <img src={stampImg} alt="도장"
                                  style={{ position: 'absolute', right: 2, top: '50%', marginTop: -18, width: 36, height: 36, objectFit: 'contain', zIndex: 10, opacity: 0.85 }} />
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>사업장주소</td>
                            <td colSpan={3} style={{ ...cTd, fontSize: 10 }}>{GAON.addr}</td>
                          </tr>
                          <tr>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>업태</td>
                            <td style={cTd}>{GAON.biz_type}</td>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>종목</td>
                            <td style={cTd}>{GAON.biz_item}</td>
                          </tr>
                          <tr>
                            <td style={{ ...cTd, background: '#fffbe8', fontWeight: 700, textAlign: 'center' }}>등록번호</td>
                            <td colSpan={3} style={cTd}>{GAON.biz_no}</td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* 안내 문구 */}
              <div style={{ fontSize: 12, marginBottom: 8 }}>아래와 같이 견적합니다.</div>

              {/* 품목 테이블 */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                <thead>
                  <tr>
                    <th style={{ ...cTh, width: '13%' }}>종별</th>
                    <th style={{ ...cTh, width: '13%' }}>규격</th>
                    <th style={{ ...cTh, width: '9%' }}>단위</th>
                    <th style={{ ...cTh, width: '16%' }}>단가</th>
                    <th style={{ ...cTh, width: '16%' }}>공급가액</th>
                    <th style={{ ...cTh }}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const specOpts = SPEC_OPTIONS[r.type] ?? []
                    return (
                      <tr key={i}>
                        {/* 종별 */}
                        <td style={{ ...cTd, textAlign: 'center', fontWeight: r.type ? 700 : 400 }}>
                          <select value={r.type} onChange={e => updateRow(i, 'type', e.target.value)} style={cSel}>
                            <option value=""></option>
                            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        {/* 규격 */}
                        <td style={{ ...cTd, textAlign: 'center' }}>
                          {r.type === '기타' || !r.type ? (
                            <input value={r.spec} onChange={e => updateRow(i, 'spec', e.target.value)}
                              style={cInp} placeholder="직접 입력" />
                          ) : (
                            <select value={r.spec} onChange={e => updateRow(i, 'spec', e.target.value)} style={cSel}>
                              <option value=""></option>
                              {specOpts.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                        </td>
                        {/* 단위 */}
                        <td style={{ ...cTd, textAlign: 'center' }}>
                          <select value={r.unit} onChange={e => updateRow(i, 'unit', e.target.value)} style={cSel}>
                            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        {/* 단가 */}
                        <td style={{ ...cTd, textAlign: 'right' }}>
                          <input value={r.unit_price}
                            onChange={e => updateRow(i, 'unit_price', e.target.value.replace(/[^\d]/g, ''))}
                            onBlur={e => updateRow(i, 'unit_price', fmtPrice(e.target.value))}
                            style={{ ...cInp, textAlign: 'right' }} placeholder="" />
                        </td>
                        {/* 공급가액 */}
                        <td style={{ ...cTd, textAlign: 'right', color: '#333' }}>
                          {supplyAmt(r)}
                        </td>
                        {/* 비고 */}
                        <td style={cTd}>
                          <input value={r.note} onChange={e => updateRow(i, 'note', e.target.value)}
                            style={cInp} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {totalSupply > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ ...cTd, textAlign: 'right', fontWeight: 700, background: '#f9f9f9' }}>합 계</td>
                      <td style={{ ...cTd, textAlign: 'right', fontWeight: 700, background: '#f9f9f9' }}>{totalSupply.toLocaleString()}</td>
                      <td style={{ ...cTd, background: '#f9f9f9' }}></td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* 비고 */}
              <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
                <span style={{ fontWeight: 700 }}>비 고 : </span>
                <span>견적 유효기간 {validDays}일</span>
                {extraNote && <span>　{extraNote}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 하단 옵션 (no-print) ── */}
      <div className="no-print px-4 pb-6 flex gap-3 flex-wrap">
        <label className="text-xs text-gray-500 flex items-center gap-1">
          유효기간
          <input value={validDays} onChange={e => setValidDays(e.target.value)}
            className="ml-1 w-12 border border-gray-300 rounded px-2 py-1 text-xs" />일
        </label>
        <input value={extraNote} onChange={e => setExtraNote(e.target.value)}
          placeholder="추가 비고 입력"
          className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 min-w-0" />
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          header, nav, aside { display: none !important; }
          body, html { margin: 0; padding: 0; background: #fff; overflow: visible !important; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          main, .flex-1 { overflow: visible !important; height: auto !important; }
          ::-webkit-scrollbar { display: none !important; }
          .print-area-wrapper { height: auto !important; overflow: visible !important; }
          .print-doc { transform: none !important; width: 180mm !important; }
        }
      `}</style>
    </div>
  )
}
