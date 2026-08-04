'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  categories: string[]
  onClose: () => void
  onSaved: () => void
}

function parseDate(val: any): string {
  if (!val) return ''
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  // 2026-06-26 또는 2026.06.26
  if (/^\d{4}[-./]\d{2}[-./]\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-').replace(/\//g, '-')
  // 20260626
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // 2026-06-26 15:30:00 형태 (거래일시)
  if (/^\d{4}[-./]\d{2}[-./]\d{2}[\s]/.test(s)) return s.slice(0, 10).replace(/\./g, '-')
  return s.slice(0, 10)
}

function parseNum(val: any): number {
  if (!val) return 0
  return Number(String(val).replace(/,/g, '').trim()) || 0
}

export default function ExpensesExcelUploadModal({ categories, onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [errors, setErrors] = useState<string[]>([])
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // 헤더 행 자동 탐색
    const KNOWN = ['날짜', '항목', '금액', '메모', '내역', '거래일', '출금', '입금', '순번', '일시', '잔액', '기록']
    let headerIdx = 0
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const matched = raw[i].filter((c: any) => KNOWN.some(k => String(c).includes(k))).length
      if (matched >= 2) { headerIdx = i; break }
    }
    const headers = raw[headerIdx].map((h: any) => String(h).trim())
    console.log('헤더 행:', headerIdx, headers)

    function col(row: any[], names: string[]): any {
      for (const n of names) {
        const idx = headers.findIndex(h => h.includes(n))
        if (idx >= 0 && row[idx] !== '') return row[idx]
      }
      return ''
    }

    const defaultCat = categories[0] ?? '기타수수료'
    const rows = raw.slice(headerIdx + 1).filter(r => r.some(c => c !== ''))

    const parsed = rows.map((r, i) => {
      // 날짜: 거래일시, 거래일, 날짜, 일자 순으로 탐색
      const dateRaw = col(r, ['거래일시', '거래일', '날짜', '일자', '작업일'])
      const date = parseDate(dateRaw)

      // 금액: 출금금액(지출) 우선, 없으면 금액/비용
      const outAmt = parseNum(col(r, ['출금금액', '출금']))
      const inAmt = parseNum(col(r, ['입금금액', '입금']))
      // 출금(지출)만 등록, 입금은 무시
      const amount = outAmt > 0 ? outAmt : parseNum(col(r, ['금액', '비용', '지출']))

      // 항목/카테고리
      const catRaw = String(col(r, ['항목', '분류', '카테고리'])).trim()
      const memoRaw = String(col(r, ['거래기록사항', '거래내용', '내역', '메모', '비고', '내용'])).trim()
      // 항목 컬럼에서 카테고리 매핑, 없으면 거래내용에서 추론
      const matched = categories.find(c => catRaw.includes(c))
        ?? categories.find(c => memoRaw.includes(c))
        ?? defaultCat

      return {
        _row: i + 1,
        expense_date: date,
        category: matched,
        amount,
        memo: memoRaw || catRaw || null,
      }
    }).filter(r => r.expense_date && r.amount > 0)
    console.log('파싱 결과:', parsed.length, '건', parsed.slice(0,2))

    setPreview(parsed)
    setErrors([])
    setStep('preview')
  }

  async function handleSave(rows: any[]) {
    setSaving(true)
    const { error } = await supabase.from('expenses').insert(
      rows.map(r => ({
        expense_date: r.expense_date,
        category: r.category,
        amount: r.amount,
        memo: r.memo,
      }))
    )
    setSaving(false)
    if (error) { setErrors([error.message]); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">엑셀 업로드 (관리비)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="px-6 py-5">
          {step === 'upload' && (
            <div>
              <p className="text-sm text-gray-600 mb-2">다음 형식을 자동 인식합니다:</p>
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs text-gray-500 space-y-1">
                <div>• 일반: <span className="font-mono">날짜, 항목, 금액, 메모</span></div>
                <div>• 은행 거래내역: <span className="font-mono">순번, 거래일시, 출금금액, 입금금액, 거래후잔액, 거래내용, 거래기록사항, 거래점, 항목</span></div>
                <div className="text-gray-400 pt-1">※ 출금금액(지출)만 등록, 입금은 제외 / 항목 컬럼 또는 거래내용에서 카테고리 자동 분류</div>
              </div>
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-xl py-10 text-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                <div className="text-3xl mb-2">📂</div>
                <div className="text-sm">클릭하여 엑셀 파일 선택</div>
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-sm text-gray-600">기간 필터:</span>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm" />
                <span className="text-gray-400 text-sm">~</span>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm" />
                <button onClick={() => {
                  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
                  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0')
                  const last = new Date(y, d.getMonth()+1, 0).getDate()
                  setFilterFrom(`${y}-${m}-01`); setFilterTo(`${y}-${m}-${String(last).padStart(2,'0')}`)
                }} className="px-2 py-1 text-sm rounded border border-indigo-400 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">
                  전월
                </button>
                {(filterFrom || filterTo) && (
                  <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
                    className="px-2 py-1 text-sm rounded border border-gray-300 text-gray-500 hover:bg-gray-50">
                    초기화
                  </button>
                )}
              </div>
              {(() => {
                const filtered = preview.filter(r =>
                  (!filterFrom || r.expense_date >= filterFrom) &&
                  (!filterTo || r.expense_date <= filterTo)
                )
                return <p className="text-sm text-gray-600 mb-3">총 <strong>{preview.length}건</strong> 인식됨{filtered.length !== preview.length ? ` → 필터 후 <strong>${filtered.length}건</strong>` : ''}.</p>
              })()}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
                  {errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              {(() => {
                const filtered = preview.filter(r =>
                  (!filterFrom || r.expense_date >= filterFrom) &&
                  (!filterTo || r.expense_date <= filterTo)
                )
                return <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          {['날짜', '항목', '금액', '메모'].map(h => (
                            <th key={h} className="px-3 py-1.5 text-left font-semibold text-gray-600 border border-gray-200">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 border border-gray-100">{r.expense_date}</td>
                            <td className="px-3 py-1.5 border border-gray-100">{r.category}</td>
                            <td className="px-3 py-1.5 border border-gray-100 text-right">{r.amount.toLocaleString()}</td>
                            <td className="px-3 py-1.5 border border-gray-100 text-gray-500">{r.memo ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button onClick={() => { setStep('upload'); setPreview([]); setErrors([]) }}
                      className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">다시 선택</button>
                    <button onClick={() => handleSave(filtered)} disabled={saving || filtered.length === 0}
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                      {saving ? '저장 중...' : `${filtered.length}건 저장`}
                    </button>
                  </div>
                </>
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
