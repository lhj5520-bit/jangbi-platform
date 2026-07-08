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
  { type: '굴삭기', spec: '06W', unit: '', unit_price: '', note: '' },
  { type: '덤프트럭', spec: '15D/T', unit: '', unit_price: '', note: '' },
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
  const [docScale, setDocScale] = useState(1)
  const [docHeight, setDocHeight] = useState(0)

  // 클라이언트 목록
  const [clients, setClients] = useState<string[]>([])

  useEffect(() => {
    setStampImg(localStorage.getItem('ts_stamp') ?? '')
    supabase.from('clients').select('name').then(({ data }: { data: any[] | null }) => {
      setClients((data ?? []).map((c: any) => c.name).filter(Boolean).sort())
    })
  }, [])

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
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setRows(prev => [...prev, newRow()])
  }

  function removeRow(id: number) {
    setRows(prev => prev.filter(r => r.id !== id))
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
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={addRow}
            className="text-xs px-2.5 py-1.5 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">
            + 줄 추가
          </button>
          <button onClick={handlePrint}
            className="text-xs px-2.5 py-1.5 rounded bg-gray-700 text-white">
            🖨️ 인쇄
          </button>
          <button onClick={handleJpg}
            className="text-xs px-2.5 py-1.5 rounded bg-green-600 text-white">
            📷 JPG / 카톡
          </button>
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
                    <td style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11, width: '30%' }}>
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input value={year} onChange={e => setYear(e.target.value)} style={{ ...cInp, width: 36, textAlign: 'right' }} />년
                        <input value={month} onChange={e => setMonth(e.target.value)} style={{ ...cInp, width: 24, textAlign: 'right' }} />월
                        <input value={day} onChange={e => setDay(e.target.value)} style={{ ...cInp, width: 20, textAlign: 'right' }} />일
                      </span>
                    </td>
                    {/* 우측: 공급자 */}
                    <td style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, whiteSpace: 'nowrap', width: '10%' }}>
                      등록번호
                    </td>
                    <td colSpan={2} style={{ border: '1px solid #aaa', padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>
                      {GAON.biz_no}
                    </td>
                  </tr>
                  <tr>
                    <td rowSpan={3} style={{ border: '1px solid #aaa', padding: '5px 8px', fontSize: 11, background: '#e8f4f8', fontWeight: 600, textAlign: 'center', verticalAlign: 'middle' }}>
                      공<br/>급<br/>자
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
                          style={{ position: 'absolute', right: 2, top: '50%', marginTop: -20, width: 40, height: 40, objectFit: 'contain', zIndex: 10, opacity: 0.85 }} />
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
                      <td style={cTd}>
                        <input value={r.type} onChange={e => updateRow(r.id, 'type', e.target.value)} style={cInp} />
                      </td>
                      <td style={cTd}>
                        <input value={r.spec} onChange={e => updateRow(r.id, 'spec', e.target.value)} style={cInp} />
                      </td>
                      <td style={cTd}>
                        <input value={r.unit} onChange={e => updateRow(r.id, 'unit', e.target.value)} style={cInp} />
                      </td>
                      <td style={cTd}>
                        <input type="number" value={r.unit_price} onChange={e => updateRow(r.id, 'unit_price', e.target.value)}
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
        @media print {
          .no-print { display: none !important; }
          body, html { margin: 0; padding: 0; background: #fff; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          .print-area-wrapper { height: auto !important; overflow: visible !important; }
          .print-doc { transform: none !important; width: 186mm !important; }
        }
      `}</style>
    </div>
  )
}
