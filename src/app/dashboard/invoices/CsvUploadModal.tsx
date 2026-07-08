'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface Row {
  client_name: string
  project_name: string
  issue_date: string
  period_start: string
  period_end: string
  supply_amount: string
  vat_amount: string
  total_amount: string
  business_no: string
  representative: string
}

const HEADER_MAP: Record<string, keyof Row> = {
  // 일반
  '발주처': 'client_name', '발주처명': 'client_name', '업체명': 'client_name', '거래처': 'client_name',
  '현장': 'project_name', '현장명': 'project_name', '공사명': 'project_name',
  '발행일': 'issue_date', '계산서일자': 'issue_date',
  '기간시작': 'period_start', '시작일': 'period_start',
  '기간종료': 'period_end', '종료일': 'period_end',
  '공급가액': 'supply_amount', '공급금액': 'supply_amount',
  '부가세': 'vat_amount', '부가가치세': 'vat_amount',
  '합계': 'total_amount', '총액': 'total_amount',
  // 홈택스 매출 세금계산서
  '상호_2': 'client_name',
  '공급받는자상호': 'client_name', '공급받는자 상호': 'client_name',
  '작성일자': 'issue_date', '발급일': 'issue_date', '품목일자': 'issue_date',
  '세액': 'vat_amount',
  '합계금액': 'total_amount', '합계 금액': 'total_amount',
  // 사업자번호 / 주민번호 모두 business_no로
  '공급받는자사업자등록번호': 'business_no',
  '공급받는자주민등록번호': 'business_no',
  '사업자등록번호_2': 'business_no',
  '주민등록번호_2': 'business_no',
  '대표자명_2': 'representative',
}

function parseAmount(v: string | number) {
  if (typeof v === 'number') return v
  return Number(String(v).replace(/[^0-9.-]/g, '')) || 0
}

export default function InvoiceCsvUploadModal({ onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Row[]>([])
  const [colMap, setColMap] = useState<Record<string, keyof Row | ''>>({})
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<any[][]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // 헤더 행 찾기: 알려진 키워드 포함 행
    const KNOWN = ['상호', '합계금액', '공급가액', '세액', '작성일자', '발급일자', '공급받는자']
    let headerIdx = 0
    for (let i = 0; i < Math.min(raw.length, 15); i++) {
      const cells = raw[i].map((c: any) => String(c))
      const matches = KNOWN.filter(k => cells.some(c => c.includes(k))).length
      if (matches >= 2) { headerIdx = i; break }
    }

    // 중복 헤더 처리 (홈택스: '상호' 두 번, '사업자등록번호' 두 번 등)
    const seen: Record<string, number> = {}
    const headers = raw[headerIdx].map((h: any) => {
      const s = String(h).trim()
      seen[s] = (seen[s] || 0) + 1
      return seen[s] > 1 ? `${s}_${seen[s]}` : s
    })

    const dataRows = raw.slice(headerIdx + 1).filter(r => r.some((c: any) => c !== ''))

    setRawHeaders(headers)
    setRawRows(dataRows)

    const autoMap: Record<string, keyof Row | ''> = {}
    headers.forEach((h: string) => { autoMap[h] = HEADER_MAP[h] ?? '' })
    setColMap(autoMap)
    setStep('map')
  }

  function applyMap() {
    const rows: Row[] = rawRows.map(row => {
      const r: Partial<Row> = {}
      rawHeaders.forEach((h, i) => {
        const field = colMap[h]
        if (field) {
          let val = row[i]
          // 날짜 객체 처리
          if (val instanceof Date) {
            val = val.toISOString().slice(0, 10)
          } else {
            val = String(val ?? '').trim()
          }
          r[field] = val
        }
      })
      const built = {
        client_name: '', project_name: '', issue_date: '', period_start: '', period_end: '',
        supply_amount: '', vat_amount: '', total_amount: '', business_no: '', representative: '',
        ...r,
      }
      // 주민번호 발행 계산서: 상호가 비어있으면 대표자명을 이름으로 사용
      if (!built.client_name && built.representative) {
        built.client_name = built.representative
      }
      return built
    }).filter(r => r.client_name && r.supply_amount)
    setPreview(rows)
    setStep('preview')
  }

  async function handleImport() {
    if (!preview.length) return
    setSaving(true)
    const { data: clients } = await supabase.from('clients').select('id, name')
    const { data: projects } = await supabase.from('projects').select('id, name')
    const clientMap = Object.fromEntries((clients ?? []).map((c: any) => [c.name, c.id]))
    const projectMap = Object.fromEntries((projects ?? []).map((p: any) => [p.name, p.id]))

    const rows = preview.map(r => {
      const supply = parseAmount(r.supply_amount)
      const vat = r.vat_amount ? parseAmount(r.vat_amount) : Math.round(supply * 0.1)
      const total = r.total_amount ? parseAmount(r.total_amount) : supply + vat
      return {
        client_id: clientMap[r.client_name] ?? null,
        client_name: r.client_name,
        business_no: r.business_no || null,
        representative: r.representative || null,
        project_id: r.project_name ? (projectMap[r.project_name] ?? null) : null,
        issue_date: r.issue_date || new Date().toISOString().slice(0, 10),
        period_start: r.period_start || null,
        period_end: r.period_end || null,
        supply_amount: supply,
        vat_amount: vat,
        total_amount: total,
        status: 'issued',
      }
    })

    const { error } = await supabase.from('invoices').insert(rows)
    setSaving(false)
    if (error) { alert('등록 중 오류가 발생했습니다: ' + error.message); return }
    onSaved()
  }

  const fieldLabel: Record<keyof Row, string> = {
    client_name: '발주처명', project_name: '현장명', issue_date: '발행일',
    period_start: '기간시작', period_end: '기간종료',
    supply_amount: '공급가액', vat_amount: '부가세', total_amount: '합계',
    business_no: '사업자/주민번호', representative: '대표자',
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-900">세금계산서 업로드</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <div className="text-center py-10">
              <div className="text-5xl mb-4">📂</div>
              <p className="text-gray-600 mb-2 font-medium">세금계산서 엑셀 파일을 선택하세요</p>
              <p className="text-xs text-gray-400 mb-1">홈택스 다운로드 파일 (.xls / .xlsx) 지원</p>
              <p className="text-xs text-gray-400 mb-6">사업자번호·주민번호 발행 계산서 모두 지원</p>
              <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg">
                파일 선택
              </button>
            </div>
          )}
          {step === 'map' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">엑셀 헤더를 항목에 매핑해주세요. 자동으로 인식된 항목은 그대로 두세요.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left px-3 py-2 font-semibold">엑셀 헤더</th>
                    <th className="text-left px-3 py-2 font-semibold">매핑 항목</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-400">샘플 값</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rawHeaders.map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-gray-800">{h}</td>
                      <td className="px-3 py-2">
                        <select value={colMap[h] ?? ''} onChange={e => setColMap(m => ({ ...m, [h]: e.target.value as keyof Row | '' }))}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">-- 무시 --</option>
                          {(Object.keys(fieldLabel) as (keyof Row)[]).map(f => (
                            <option key={f} value={f}>{fieldLabel[f]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[140px]">{String(rawRows[0]?.[i] ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {step === 'preview' && (
            <div>
              <p className="text-sm text-gray-500 mb-3">총 <span className="font-bold text-gray-800">{preview.length}건</span> 등록 예정</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2">발주처</th>
                      <th className="text-left px-3 py-2">현장</th>
                      <th className="text-left px-3 py-2">발행일</th>
                      <th className="text-right px-3 py-2">공급가액</th>
                      <th className="text-right px-3 py-2">부가세</th>
                      <th className="text-right px-3 py-2">합계</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{r.client_name}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.project_name || '-'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.issue_date || '-'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-800">{parseAmount(r.supply_amount).toLocaleString()}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{r.vat_amount ? parseAmount(r.vat_amount).toLocaleString() : '자동'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-900">{r.total_amount ? parseAmount(r.total_amount).toLocaleString() : '자동'}</td>
                      </tr>
                    ))}
                    {preview.length > 20 && (
                      <tr><td colSpan={6} className="px-3 py-2 text-center text-gray-400">... 외 {preview.length - 20}건</td></tr>
                    )}
                    {preview.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">인식된 데이터가 없습니다. 매핑을 확인해주세요.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-3">* 부가세·합계 미입력 시 공급가액 기준 10% 자동 계산</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
          {step === 'map' && (
            <>
              <button onClick={() => setStep('upload')} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">← 다시 선택</button>
              <button onClick={applyMap} className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">미리보기 →</button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('map')} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">← 수정</button>
              <button onClick={handleImport} disabled={saving || preview.length === 0}
                className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium">
                {saving ? '등록 중...' : `✓ ${preview.length}건 등록`}
              </button>
            </>
          )}
          {step === 'upload' && (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          )}
        </div>
      </div>
    </div>
  )
}
