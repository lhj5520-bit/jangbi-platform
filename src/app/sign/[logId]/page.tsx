'use client'

import { useEffect, useRef, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toJpeg } from 'html-to-image'

export default function SignPage({ params }: { params: Promise<{ logId: string }> }) {
  const { logId } = use(params)
  const supabase = createClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const driverCanvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [activeCanvas, setActiveCanvas] = useState<'driver' | 'site' | null>(null)
  const [signerName, setSignerName] = useState('')
  const [log, setLog] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const [hasSiteSig, setHasSiteSig] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    supabase
      .from('daily_logs')
      .select('*, dispatch:dispatches(*, equipment:equipment(*), supplier:suppliers(*), project:projects(*, client:clients(*)))')
      .eq('id', logId)
      .single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setLog(data)
          if (data.signed_at) setAlreadySigned(true)
        }
        setLoading(false)
      })
  }, [logId])

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent, target: 'driver' | 'site') {
    e.preventDefault()
    const canvas = target === 'site' ? canvasRef.current : driverCanvasRef.current
    if (!canvas) return
    setIsDrawing(true)
    setActiveCanvas(target)
    if (target === 'site') setHasSiteSig(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing || !activeCanvas) return
    const canvas = activeCanvas === 'site' ? canvasRef.current : driverCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    lastPos.current = pos
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    setIsDrawing(false)
    lastPos.current = null
  }

  function clearCanvas(target: 'driver' | 'site') {
    const canvas = target === 'site' ? canvasRef.current : driverCanvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    if (target === 'site') setHasSiteSig(false)
  }

  async function handleSavePdf() {
    if (!docRef.current) return
    setSavingPdf(true)
    try {
      const dataUrl = await toJpeg(docRef.current, { quality: 0.95, backgroundColor: '#ffffff', pixelRatio: 2 })
      const d = log?.dispatch ?? {}
      const dateStr = log?.log_date ?? new Date().toISOString().slice(0, 10)
      const clientName = (d as any).client_name ?? ''
      const fileName = `작업확인서_${dateStr}_${clientName}.pdf`
      const win = window.open('', '_blank')
      if (!win) { alert('팝업 차단을 해제해주세요.'); setSavingPdf(false); return }
      win.document.write(`<!DOCTYPE html><html><head><title>${fileName}</title>
        <style>@page{margin:0;size:A4 portrait}body{margin:0;padding:0}img{width:100%;height:auto;display:block}
        @media print{body{margin:0}}</style></head>
        <body><img src="${dataUrl}" /></body></html>`)
      win.document.close()
      win.focus()
      setTimeout(() => { win.print(); }, 800)
    } catch (e) { alert('PDF 저장 실패: ' + e) }
    setSavingPdf(false)
  }

  async function handleSubmit() {
    if (!signerName.trim()) return alert('현장책임자 이름을 입력해주세요.')
    if (!hasSiteSig) return alert('현장책임자 서명을 해주세요.')
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    const signatureData = canvas.toDataURL('image/png')
    const driverSigData = driverCanvasRef.current ? driverCanvasRef.current.toDataURL('image/png') : null
    await supabase.from('daily_logs').update({
      signature_data: signatureData,
      driver_signature_data: driverSigData,
      signer_name: signerName.trim(),
      signed_at: new Date().toISOString(),
    }).eq('id', logId)
    setSaving(false)
    setDone(true)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-gray-400">불러오는 중...</div>
    </div>
  )

  if (!log) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center text-gray-500">유효하지 않은 링크입니다.</div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">서명 완료</h2>
        <p className="text-gray-500 text-sm">작업확인서 서명이 완료되었습니다.</p>
        <p className="text-xs text-gray-400 mt-3">현장책임자: {signerName}</p>
        <button
          onClick={() => {
            const url = window.location.href
            if (navigator.share) navigator.share({ title: '작업확인서', text: '서명 완료된 작업확인서입니다.', url })
            else { navigator.clipboard.writeText(url); alert('링크가 복사되었습니다.') }
          }}
          className="mt-6 w-full py-3 rounded-xl bg-blue-600 text-white font-medium text-sm"
        >
          완료된 확인서 공유하기
        </button>
        <p className="text-xs text-gray-400 mt-2">링크를 받은 사람은 서명된 확인서를 볼 수 있습니다</p>
      </div>
    </div>
  )



  const d = log.dispatch
  const eq = d?.equipment
  const equipText: string = (d as any)?.equipment_text ?? ''
  const equipParts = equipText.trim().split(/\s+/)
  const typeMap: Record<string, string> = { excavator: '굴삭기', dump: '덤프', cargo: '화물차', truck: '화물차' }
  const equipName = (() => {
    if (eq) {
      const typeName = typeMap[eq.type] ?? eq.type ?? ''
      const spec = eq.spec ?? eq.model ?? ''
      return [typeName, spec].filter(Boolean).join(' ') || '-'
    }
    // equipment_text fallback
    return (equipParts.length > 1 ? equipParts.slice(0, -1).join(' ') : equipParts[0] ?? '') || '-'
  })()
  const plateNo = (eq?.plate_no ?? (equipParts.length > 1 ? equipParts[equipParts.length - 1] : '')) || '-'
  const dateStr = log.log_date ? log.log_date.replace(/-/g, '. ') + '.' : ''
  function calcSlotHours(slot: string | null): number {
    if (!slot) return 0
    const m = slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
    if (!m) return 0
    return Math.max(0, (Number(m[3]) * 60 + Number(m[4]) - Number(m[1]) * 60 - Number(m[2])) / 60)
  }
  const totalHours = Math.round((calcSlotHours(log.work_time_1) + calcSlotHours(log.work_time_2) + calcSlotHours((log as any).work_time_3)) * 10) / 10
  const timeSlots = [log.work_time_1, log.work_time_2, (log as any).work_time_3].filter(Boolean)
  const workTypes = [log.work_type_1, log.work_type_2, (log as any).work_type_3]
  const workPrices = [log.work_price_1, log.work_price_2, (log as any).work_price_3]

  return (
    <div className="min-h-screen bg-gray-200 py-6 px-3 flex flex-col items-center">
      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
      <div ref={docRef} className="w-full max-w-lg bg-white shadow-lg" style={{ fontFamily: 'sans-serif' }}>

        {/* 헤더 */}
        <div className="flex items-start justify-between p-4 border-b-2 border-gray-800">
          <div>
            <div className="text-base font-black text-gray-900 leading-tight">건설기계임대차</div>
            <div className="text-xs text-gray-600">（공급자용）</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-900">표준계약서</div>
            <div className="text-base font-black text-gray-900">작업확인서</div>
          </div>
          <div className="flex flex-col items-center justify-center">
            <img src="/icons/ftc-logo.svg" alt="공정거래위원회" style={{ width: 80, height: 28 }} />
          </div>
        </div>

        {/* 날짜 */}
        <div className="text-right px-4 py-2 text-sm font-medium border-b border-gray-300">
          {dateStr}
        </div>

        {/* 기본 정보 테이블 */}
        <table className="w-full text-sm border-collapse">
          <tbody>
            <tr className="border-b border-gray-300">
              <td className="px-3 py-2.5 font-bold bg-gray-50 border-r border-gray-300 whitespace-nowrap w-24">건설기계명</td>
              <td className="px-3 py-2.5 border-r border-gray-300">{equipName}</td>
              <td className="px-3 py-2.5 font-bold bg-gray-50 border-r border-gray-300 whitespace-nowrap w-20">차량번호</td>
              <td className="px-3 py-2.5 font-medium">{plateNo}</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="px-3 py-2.5 font-bold bg-gray-50 border-r border-gray-300">현 장 명</td>
              <td className="px-3 py-2.5" colSpan={3}>{(d as any)?.site_name ?? d?.project?.name ?? '-'}</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="px-3 py-2 font-bold bg-gray-50 border-r border-gray-300 text-xs leading-tight">
                회 사 명<br /><span className="font-normal text-gray-400">(시행사/시공사)</span>
              </td>
              <td className="px-3 py-2.5" colSpan={3}>{(d as any)?.client_name ?? d?.project?.client?.name ?? '-'}</td>
            </tr>

            {/* 작업시간 - 내용 없는 슬롯은 숨김 */}
            {[0, 1, 2].map((i) => {
              if (i > 0 && !timeSlots[i] && !workTypes[i]) return null
              return (
                <tr key={i} className="border-b border-gray-300">
                  <td className="px-2 py-2 font-bold bg-gray-50 border-r border-gray-300 whitespace-nowrap text-sm" style={{ width: '60px' }}>
                    {i === 0 ? '작업시간' : ''}
                  </td>
                  <td className="border-r border-gray-300 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {workTypes[i] && <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{workTypes[i]}</span>}
                      {timeSlots[i] ?? <span className="text-gray-300">: ~ :</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 font-medium whitespace-nowrap">
                    {timeSlots[i] ? (
                      <div>
                        <div>{calcSlotHours(timeSlots[i])} 시간</div>
                        {workPrices[i] && <div className="text-xs text-blue-600">{Math.round(calcSlotHours(timeSlots[i]) * workPrices[i]).toLocaleString()}원</div>}
                      </div>
                    ) : <span className="text-gray-300">시간</span>}
                  </td>
                </tr>
              )
            })}
            <tr className="border-b border-gray-300">
              <td className="px-2 py-2 bg-gray-50 border-r border-gray-300 text-right font-bold text-sm">총</td>
              <td className="px-3 py-2 font-bold" colSpan={2}>
                {totalHours} 시간
                {workPrices.some(Boolean) && (
                  <span className="ml-2 text-sm text-blue-700">
                    {[0,1,2].reduce((s, i) => s + (timeSlots[i] && workPrices[i] ? Math.round(calcSlotHours(timeSlots[i]) * workPrices[i]) : 0), 0).toLocaleString()}원
                  </span>
                )}
              </td>
            </tr>

            <tr className="border-b border-gray-300">
              <td className="px-3 py-2.5 font-bold bg-gray-50 border-r border-gray-300">작업내용</td>
              <td className="px-3 py-2.5" colSpan={3}>{log.work_content ?? log.note ?? '-'}</td>
            </tr>
            <tr className="border-b-2 border-gray-800">
              <td className="px-3 py-2.5 font-bold bg-gray-50 border-r border-gray-300">특기사항</td>
              <td className="px-3 py-2.5" colSpan={3}>{log.special_notes ?? ''}</td>
            </tr>
          </tbody>
        </table>

        {/* 계약서 내용 */}
        <div className="px-4 py-3 border-b border-gray-300">
          <div className="text-xs font-bold mb-1.5">■ 계약서</div>
          <div className="text-xs text-gray-600 space-y-1 leading-relaxed">
            <p>1. 본 계약서는 공정거래위원회 표준약관 제10059호 건설기계 임대차 표준계약서 건설기계 임대차표준계약 일반조건에 정한 것으로 계약하며 일반조건에 명시하지 아니한 사항에 대하여 일반 상관례 및 제반 법률 규정에 의거 하기로 한다.</p>
            <p>2. 일일 작업은 8시간으로 한다.</p>
            <p>3. 대여금은 건산법 제34조 규정에 따라 지급하여야 하며, 건산법 제35조 규정에 해당될 경우 발주자에게 직접 지급을 요청할 수 있다.<br /><span className="text-gray-400">（임대료 체불시 건설분쟁조정위원회, 국토교통부 신고）</span></p>
          </div>
        </div>

        {/* 서명란 */}
        {!alreadySigned && (
          <div className="text-xs text-center py-2 bg-yellow-50 border-y border-yellow-200 text-yellow-800 font-medium">
            ① 운전자 서명 후 → 현장소장에게 폰 전달 → ② 현장소장 서명
          </div>
        )}
        <div className="grid grid-cols-2 border-b-2 border-gray-800">
          {/* 운전자 서명 */}
          <div className="border-r border-gray-300 p-3">
            <div className="text-xs font-bold mb-1 text-center">{alreadySigned ? '운전자명' : '① 운전자명'}</div>
            {/* 차주≠운전자면 둘 다 표시 */}
            {log.driver_name && d?.driver_name && log.driver_name !== d.driver_name ? (
              <div className="text-center mb-2">
                <div className="text-xs text-gray-400">업체: {(d as any).supplier?.name ?? d.driver_name}</div>
                <div className="text-sm font-medium">운전자: {log.driver_name}</div>
              </div>
            ) : (
              <div className="text-sm font-medium text-center mb-2">{log.driver_name ?? d?.driver_name ?? ''}</div>
            )}
            {log.driver_signature_data ? (
              <img src={log.driver_signature_data} alt="운전자서명" className="w-full border border-gray-200 rounded bg-white" style={{ height: '80px', objectFit: 'contain' }} />
            ) : (
              <>
                <div className="border border-dashed border-gray-300 rounded bg-gray-50 relative" style={{ height: '80px' }}>
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300 pointer-events-none">운전자 서명</div>
                  <canvas
                    ref={driverCanvasRef}
                    width={300}
                    height={150}
                    className="w-full h-full touch-none cursor-crosshair"
                    onMouseDown={e => startDraw(e, 'driver')}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={e => startDraw(e, 'driver')}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                </div>
                {!alreadySigned && <button onClick={() => clearCanvas('driver')} className="text-xs text-gray-400 underline w-full text-center mt-1">지우기</button>}
              </>
            )}
          </div>

          {/* 현장 책임자 서명 */}
          <div className="p-3">
            <div className="text-xs font-bold mb-1 text-center">{alreadySigned ? '현장책임자확인' : '② 현장책임자확인'}</div>
            {alreadySigned ? (
              <>
                <div className="text-sm font-medium text-center mb-2">{log.signer_name}</div>
                {log.signature_data && (
                  <img src={log.signature_data} alt="서명" className="w-full border border-gray-200 rounded bg-white" style={{ height: '80px', objectFit: 'contain' }} />
                )}
                <div className="text-right mt-1"><span className="text-xs text-gray-500">（인）</span></div>
              </>
            ) : (
              <>
                <div className="mb-2">
                  <input
                    type="text"
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="이름 입력"
                    className="w-full text-sm text-center border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="border-2 border-gray-400 rounded bg-gray-50 relative" style={{ height: '80px' }}>
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300 pointer-events-none select-none">서명</div>
                  <canvas
                    ref={canvasRef}
                    width={300}
                    height={150}
                    className="w-full h-full touch-none cursor-crosshair"
                    onMouseDown={e => startDraw(e, 'site')}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={e => startDraw(e, 'site')}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                </div>
                <div className="flex justify-between items-center mt-1">
                  <button onClick={() => clearCanvas('site')} className="text-xs text-gray-400 underline">지우기</button>
                  <span className="text-xs text-gray-500">（인）</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-between items-center px-4 py-2 bg-gray-50">
          <div className="text-sm font-bold text-gray-900">(주)가온건설중기</div>
          <div className="text-xs text-gray-500">T. 043) 264-0453  F. 043) 260-0454</div>
        </div>
      </div>

      {/* 제출/공유 버튼 */}
      <div className="w-full max-w-lg mt-4 px-3 no-print">
        {alreadySigned ? (
          <>
            <div className="text-center text-sm text-green-700 font-medium mb-3">✅ 서명 완료 — {log.signer_name} · {new Date(log.signed_at).toLocaleString('ko-KR')}</div>
            <button
              onClick={handleSavePdf}
              disabled={savingPdf}
              className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-base transition-colors shadow-lg mb-3"
            >
              {savingPdf ? '저장 중...' : '📄 PDF 저장'}
            </button>
            <button
              onClick={() => {
                const url = window.location.href
                if (navigator.share) navigator.share({ title: '작업확인서', text: '서명 완료된 작업확인서입니다.', url })
                else { navigator.clipboard.writeText(url); alert('링크가 복사되었습니다.') }
              }}
              className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-bold text-base transition-colors shadow-lg"
            >
              완료된 확인서 공유하기
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-base transition-colors shadow-lg"
            >
              {saving ? '저장 중...' : '서명 완료 및 제출'}
            </button>
            <button
              onClick={handleSavePdf}
              disabled={savingPdf}
              className="w-full py-4 rounded-2xl bg-gray-600 hover:bg-gray-700 disabled:opacity-60 text-white font-bold text-base transition-colors shadow-lg mt-3"
            >
              {savingPdf ? '저장 중...' : '📄 PDF 저장 (서명 없이)'}
            </button>
            <p className="text-xs text-center text-gray-400 mt-2">서명 후 제출하면 수정이 어렵습니다.</p>
          </>
        )}
      </div>
    </div>
  )
}
