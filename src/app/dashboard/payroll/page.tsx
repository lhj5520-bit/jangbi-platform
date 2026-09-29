'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toPng } from 'html-to-image'

interface DispatchRow {
  id: string
  log_date: string
  driver_name: string
  site_name: string
  client_name: string
  equipment_text: string
  operating_hours?: number | null
  unit_price?: number | null
  engineer_daily_wage?: number | null
  w1_hours?: number | null; w1_unit?: number | null; w1_wage?: number | null
  w2_hours?: number | null; w2_unit?: number | null; w2_wage?: number | null
  w3_hours?: number | null; w3_unit?: number | null; w3_wage?: number | null
}

interface DriverSummary {
  name: string
  totalWage: number
  rows: DispatchRow[]
}

const fmt = (n: number) => n.toLocaleString('ko-KR')

export default function PayrollPage() {
  const supabase = createClient()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [drivers, setDrivers] = useState<DriverSummary[]>([])
  const [selectedDriver, setSelectedDriver] = useState<DriverSummary | null>(null)
  const [companyName, setCompanyName] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const c = localStorage.getItem('ts_company')
      if (c) setCompanyName(JSON.parse(c).name || '')
    } catch {}
  }, [])

  async function loadData() {
    setLoading(true)
    setSelectedDriver(null)
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // 배차 전체 조회 (driver_name 필터 없이)
    const { data: dispatches } = await supabase
      .from('dispatches')
      .select('id, log_date, driver_name, site_name, client_name, equipment_text')
      .gte('log_date', from)
      .lte('log_date', to)
      .order('log_date', { ascending: true })

    if (!dispatches || dispatches.length === 0) { setLoading(false); return }

    const dispIds = dispatches.map(d => d.id)
    const { data: logs } = await supabase
      .from('daily_logs')
      .select('dispatch_id, driver_name, operating_hours, unit_price, engineer_daily_wage, w1_hours, w1_unit, w2_hours, w2_unit, w3_hours, w3_unit')
      .in('dispatch_id', dispIds)

    const logMap: Record<string, any> = {}
    ;(logs ?? []).forEach(l => { logMap[l.dispatch_id] = l })

    const rows: DispatchRow[] = dispatches.map(d => {
      const l = logMap[d.id]
      // 운전자명: daily_logs.driver_name 우선, 없으면 dispatches.driver_name(차주명)
      const resolvedDriverName = l?.driver_name || d.driver_name || ''
      return {
        ...d,
        driver_name: resolvedDriverName,
        operating_hours: l?.operating_hours ?? null,
        unit_price: l?.unit_price ?? null,
        engineer_daily_wage: l?.engineer_daily_wage ?? null,
        w1_hours: l?.w1_hours ?? null, w1_unit: l?.w1_unit ?? null,
        w2_hours: l?.w2_hours ?? null, w2_unit: l?.w2_unit ?? null,
        w3_hours: l?.w3_hours ?? null, w3_unit: l?.w3_unit ?? null,
      }
    }).filter(r => r.driver_name) // 이름 없는 행 제외

    // 운전자명 기준 그룹
    const map: Record<string, DispatchRow[]> = {}
    rows.forEach(r => {
      const key = r.driver_name
      if (!map[key]) map[key] = []
      map[key].push(r)
    })

    const summaries: DriverSummary[] = Object.entries(map).map(([name, dRows]) => {
      const totalWage = dRows.reduce((s, r) => {
        const wage = r.engineer_daily_wage
          ?? (r.w1_hours && r.w1_unit ? Math.round(r.w1_hours * r.w1_unit) : null)
          ?? (r.operating_hours && r.unit_price ? Math.round(r.operating_hours * r.unit_price) : 0)
        return s + (wage ?? 0)
      }, 0)
      return { name, totalWage, rows: dRows }
    }).sort((a, b) => b.totalWage - a.totalWage)

    setDrivers(summaries)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [year, month])

  function getWage(r: DispatchRow): number {
    if (r.engineer_daily_wage != null) return r.engineer_daily_wage
    const slots = [
      r.w1_hours && r.w1_unit ? r.w1_hours * r.w1_unit : 0,
      r.w2_hours && r.w2_unit ? r.w2_hours * r.w2_unit : 0,
      r.w3_hours && r.w3_unit ? r.w3_hours * r.w3_unit : 0,
    ]
    const slotSum = slots.reduce((a, b) => a + b, 0)
    if (slotSum > 0) return Math.round(slotSum)
    if (r.operating_hours && r.unit_price) return Math.round(r.operating_hours * r.unit_price)
    return 0
  }

  function getHours(r: DispatchRow): string {
    if (r.w1_hours) {
      const parts = [r.w1_hours, r.w2_hours, r.w3_hours].filter(Boolean)
      return parts.join('+') + 'h'
    }
    if (r.operating_hours) return r.operating_hours + 'h'
    return '-'
  }

  async function handlePrint() {
    if (!printRef.current) return
    window.print()
  }

  async function handleSaveImage() {
    if (!printRef.current) return
    try {
      const dataUrl = await toPng(printRef.current, { backgroundColor: '#fff', pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `급여명세서_${selectedDriver?.name}_${year}년${month}월.png`
      a.click()
    } catch (e) {
      alert('이미지 저장 오류')
    }
  }

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  return (
    <div className="p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">급여명세서</h1>
          <p className="text-sm text-gray-500 mt-0.5">배차내역서 운전자명 기준 집계</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm">‹</button>
          <div className="flex items-center gap-1">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm">
              {Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
          <button onClick={nextMonth} className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm">›</button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* 왼쪽: 운전자 목록 */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">{year}년 {month}월 운전자</span>
              <span className="ml-2 text-xs text-gray-400">{drivers.length}명</span>
            </div>
            {loading ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">불러오는 중...</div>
            ) : drivers.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">배차 내역이 없습니다</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {drivers.map(d => (
                  <button key={d.name} onClick={() => setSelectedDriver(d)}
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${selectedDriver?.name === d.name ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}>
                    <div className="font-medium text-gray-900 text-sm">{d.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{d.rows.length}건 · {fmt(d.totalWage)}원</div>
                  </button>
                ))}
              </div>
            )}
            {drivers.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                <div className="text-xs text-gray-500">합계</div>
                <div className="text-sm font-bold text-gray-900">
                  {fmt(drivers.reduce((s, d) => s + d.totalWage, 0))}원
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: 명세서 */}
        <div className="flex-1">
          {!selectedDriver ? (
            <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-64">
              <p className="text-gray-400 text-sm">왼쪽에서 운전자를 선택하세요</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 print:hidden">
                <button onClick={handlePrint}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  🖨️ 인쇄
                </button>
                <button onClick={handleSaveImage}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
                  📷 이미지 저장
                </button>
              </div>

              {/* 명세서 본문 */}
              <div ref={printRef} style={{ fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif", background: '#fff', padding: '32px', border: '1px solid #ccc', borderRadius: 8, maxWidth: 700 }}>
                {/* 제목 */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 8, marginBottom: 4 }}>급 여 명 세 서</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{companyName || '(주)가온건설중기'}</div>
                </div>

                {/* 인적사항 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', background: '#e8f4f8', fontWeight: 600, width: '20%', textAlign: 'center' }}>성 명</td>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', width: '30%' }}>{selectedDriver.name}</td>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', background: '#e8f4f8', fontWeight: 600, width: '20%', textAlign: 'center' }}>지급월</td>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', width: '30%' }}>{year}년 {month}월</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', background: '#e8f4f8', fontWeight: 600, textAlign: 'center' }}>작업일수</td>
                      <td style={{ border: '1px solid #999', padding: '6px 10px' }}>{selectedDriver.rows.length}일</td>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', background: '#e8f4f8', fontWeight: 600, textAlign: 'center' }}>지급총액</td>
                      <td style={{ border: '1px solid #999', padding: '6px 10px', fontWeight: 700, color: '#1a56db' }}>
                        {fmt(selectedDriver.totalWage)}원
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 작업 내역 */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#e8f4f8' }}>
                      <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'center' }}>날짜</th>
                      <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'center' }}>현장명</th>
                      <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'center' }}>발주처</th>
                      <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'center' }}>장비</th>
                      <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'center' }}>가동시간</th>
                      <th style={{ border: '1px solid #999', padding: '6px 8px', textAlign: 'center' }}>지급액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDriver.rows.map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                        <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>{r.log_date}</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{r.site_name || '-'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px 8px' }}>{r.client_name || '-'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center' }}>{r.equipment_text || '-'}</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'center' }}>{getHours(r)}</td>
                        <td style={{ border: '1px solid #ccc', padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>{fmt(getWage(r))}원</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0f4ff' }}>
                      <td colSpan={5} style={{ border: '1px solid #999', padding: '7px 8px', textAlign: 'center', fontWeight: 700 }}>합 계</td>
                      <td style={{ border: '1px solid #999', padding: '7px 8px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#1a56db' }}>
                        {fmt(selectedDriver.totalWage)}원
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* 서명란 */}
                <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555' }}>
                  <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <div style={{ borderTop: '1px solid #aaa', paddingTop: 6, marginTop: 36 }}>지급인 (인)</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 120 }}>
                    <div style={{ borderTop: '1px solid #aaa', paddingTop: 6, marginTop: 36 }}>수령인 (인)</div>
                  </div>
                </div>

                <div style={{ marginTop: 20, fontSize: 11, color: '#aaa', textAlign: 'center' }}>
                  위와 같이 급여를 지급합니다. {year}년 {month}월
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #__next, #__next * { visibility: hidden; }
          [data-print-area], [data-print-area] * { visibility: visible; }
        }
      `}</style>
    </div>
  )
}
