'use client'

import React, { useEffect, useRef, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'

const EQ_LABEL: Record<string, string> = {
  excavator: '굴삭기', dump: '덤프트럭', truck: '화물차', cargo: '화물차',
}

export default function RentalSignPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = use(params)
  const supabase = createClient()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  const [contract, setContract] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [alreadySigned, setAlreadySigned] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [signerName, setSignerName] = useState('')

  useEffect(() => {
    supabase.from('rental_contracts').select('*').eq('id', contractId).single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setContract(data)
          if (data.signed_at) setAlreadySigned(true)
          if (data.lessee_ceo) setSignerName(data.lessee_ceo)
        }
        setLoading(false)
      })
  }, [contractId])

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const sx = canvas.width / rect.width
    const sy = canvas.height / rect.height
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * sx, y: (e.touches[0].clientY - rect.top) * sy }
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    setIsDrawing(true)
    setHasSig(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !lastPos.current) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.stroke()
    lastPos.current = pos
  }

  function endDraw() {
    setIsDrawing(false)
    lastPos.current = null
  }

  function clearSig() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
  }

  async function handleSubmit() {
    if (!hasSig) { alert('서명을 먼저 해주세요.'); return }
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)

    const sigData = canvas.toDataURL('image/png')
    const { error } = await supabase.from('rental_contracts').update({
      lessee_signature: sigData,
      lessee_ceo: signerName || contract?.lessee_ceo,
      signed_at: new Date().toISOString(),
    }).eq('id', contractId)

    setSaving(false)
    if (error) { alert('서명 저장 실패: ' + error.message); return }
    setDone(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">계약서 불러오는 중…</p>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-2">계약서를 찾을 수 없습니다.</p>
          <p className="text-gray-400 text-sm">링크가 올바른지 확인해 주세요.</p>
        </div>
      </div>
    )
  }

  if (done || alreadySigned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm px-4">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">서명이 완료됐습니다</h2>
          <p className="text-gray-500 text-sm">
            {contract.lessee_name} · {contract.site_name || '현장 미입력'}<br />
            서명 일시: {(contract.signed_at ? new Date(contract.signed_at) : new Date()).toLocaleString('ko-KR')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* 헤더 */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">건설기계임대차 표준계약서</h1>
          <p className="text-sm text-gray-500 mt-1">서명 요청 — 아래 내용을 확인 후 서명해 주세요</p>
        </div>

        {/* 계약 요약 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">계약 내용 확인</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-24 text-gray-500 shrink-0">임대인</dt>
              <dd className="text-gray-800 font-medium">{contract.lessor_name || '-'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-gray-500 shrink-0">임차인</dt>
              <dd className="text-gray-800 font-medium">{contract.lessee_name || '-'}</dd>
            </div>
            {contract.equip_name && (
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 shrink-0">건설기계</dt>
                <dd className="text-gray-800">{contract.equip_name} {contract.equip_reg_no}</dd>
              </div>
            )}
            {contract.site_name && (
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 shrink-0">현장명</dt>
                <dd className="text-gray-800">{contract.site_name}</dd>
              </div>
            )}
            {(contract.period_start || contract.period_end) && (
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 shrink-0">사용기간</dt>
                <dd className="text-gray-800">{contract.period_start} ~ {contract.period_end}</dd>
              </div>
            )}
            {contract.total_amount && (
              <div className="flex gap-2">
                <dt className="w-24 text-gray-500 shrink-0">총 금액</dt>
                <dd className="text-gray-800">금 {Number(contract.total_amount).toLocaleString()}원</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="w-24 text-gray-500 shrink-0">지급시기</dt>
              <dd className="text-gray-800">{contract.payment_days || 30}일 이내</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-24 text-gray-500 shrink-0">계약일</dt>
              <dd className="text-gray-800">{contract.contract_date || '-'}</dd>
            </div>
          </dl>
        </div>

        {/* 서명자 이름 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">서명자 성명</label>
          <input
            value={signerName}
            onChange={e => setSignerName(e.target.value)}
            placeholder={contract.lessee_ceo || '서명자 이름 입력'}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 서명 캔버스 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">임차인 서명</label>
            <button onClick={clearSig} className="text-xs text-red-500 hover:underline">지우기</button>
          </div>
          <div className="border border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
            <canvas
              ref={canvasRef}
              width={600} height={200}
              className="w-full touch-none"
              style={{ cursor: 'crosshair' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
            />
          </div>
          {!hasSig && (
            <p className="text-xs text-gray-400 mt-1.5 text-center">위 영역에 서명해 주세요</p>
          )}
        </div>

        {/* 동의 안내 */}
        <p className="text-xs text-gray-400 text-center mb-4 leading-relaxed">
          위 계약 내용을 확인하고, 임대차 표준계약 일반조건에 동의하여 서명합니다.
        </p>

        {/* 제출 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={saving || !hasSig}
          className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-base disabled:opacity-50 transition-colors hover:bg-blue-700"
        >
          {saving ? '저장 중…' : '서명 완료 및 제출'}
        </button>
      </div>
    </div>
  )
}
