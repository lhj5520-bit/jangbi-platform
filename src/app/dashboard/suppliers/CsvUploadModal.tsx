'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface Row {
  name: string
  business_no: string
  ceo_name: string
  address: string
  contact: string
}

// 국세청 CSV 헤더 자동 매핑
const HEADER_MAP: Record<string, keyof Row> = {
  '상호': 'name', '법인명': 'name', '업체명': 'name', '회사명': 'name', '상호(법인명)': 'name',
  '사업자등록번호': 'business_no', '사업자번호': 'business_no', '등록번호': 'business_no',
  '대표자': 'ceo_name', '대표자명': 'ceo_name', '대표자성명': 'ceo_name',
  '주소': 'address', '사업장주소': 'address', '사업장소재지': 'address',
  '전화번호': 'contact', '연락처': 'contact', '전화': 'contact',
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // BOM 제거
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  const split = (line: string) => {
    const result: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
      else cur += ch
    }
    result.push(cur.trim())
    return result
  }

  return { headers: split(lines[0]), rows: lines.slice(1).map(split) }
}

export default function CsvUploadModal({ onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Row[]>([])
  const [colMap, setColMap] = useState<Record<string, keyof Row | ''>>({})
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'upload' | 'map' | 'preview'>('upload')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const { headers, rows } = parseCsv(text)
      setRawHeaders(headers)
      setRawRows(rows)

      // 자동 매핑
      const autoMap: Record<string, keyof Row | ''> = {}
      headers.forEach(h => { autoMap[h] = HEADER_MAP[h.trim()] ?? '' })
      setColMap(autoMap)
      setStep('map')
    }
    reader.readAsText(file, 'EUC-KR')
  }

  function applyMap() {
    const rows: Row[] = rawRows.map(row => {
      const r: Partial<Row> = {}
      rawHeaders.forEach((h, i) => {
        const field = colMap[h]
        if (field) r[field] = row[i] ?? ''
      })
      return { name: '', business_no: '', ceo_name: '', address: '', contact: '', ...r }
    }).filter(r => r.name)
    setPreview(rows)
    setStep('preview')
  }

  async function handleImport() {
    if (!preview.length) return
    setSaving(true)
    const rows = preview.map(r => ({
      name: r.name,
      business_no: r.business_no || null,
      ceo_name: r.ceo_name || null,
      address: r.address || null,
      contact: r.contact || null,
    }))
    const { error } = await supabase.from('suppliers').insert(rows)
    setSaving(false)
    if (error) {
      alert('등록 중 오류가 발생했습니다: ' + error.message)
      return
    }
    onSaved()
  }

  const fieldLabel: Record<keyof Row, string> = {
    name: '업체명', business_no: '사업자번호', ceo_name: '대표자', address: '주소', contact: '연락처',
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-900">CSV 일괄 업로드</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* STEP 1: 파일 선택 */}
          {step === 'upload' && (
            <div className="text-center py-10">
              <div className="text-5xl mb-4">📂</div>
              <p className="text-gray-600 mb-2 font-medium">국세청 CSV 파일을 선택하세요</p>
              <p className="text-xs text-gray-400 mb-6">
                홈택스 사업자 조회 내보내기 파일 (EUC-KR / UTF-8 모두 지원)
              </p>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg">
                파일 선택
              </button>
            </div>
          )}

          {/* STEP 2: 컬럼 매핑 */}
          {step === 'map' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">CSV 헤더를 어떤 항목으로 사용할지 지정해주세요. 자동으로 감지된 항목은 이미 선택되어 있습니다.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="text-left px-3 py-2 font-semibold">CSV 헤더</th>
                    <th className="text-left px-3 py-2 font-semibold">매핑 항목</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-400">샘플 값</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rawHeaders.map((h, i) => (
                    <tr key={h}>
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
                      <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[140px]">
                        {rawRows[0]?.[i] ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* STEP 3: 미리보기 */}
          {step === 'preview' && (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                총 <span className="font-bold text-gray-800">{preview.length}건</span>이 등록됩니다. (업체명 없는 행 제외, 사업자번호 중복 시 건너뜀)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2">업체명</th>
                      <th className="text-left px-3 py-2">사업자번호</th>
                      <th className="text-left px-3 py-2">대표자</th>
                      <th className="text-left px-3 py-2">주소</th>
                      <th className="text-left px-3 py-2">연락처</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{r.name}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.business_no || '-'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.ceo_name || '-'}</td>
                        <td className="px-3 py-1.5 text-gray-500 truncate max-w-[160px]">{r.address || '-'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.contact || '-'}</td>
                      </tr>
                    ))}
                    {preview.length > 20 && (
                      <tr><td colSpan={5} className="px-3 py-2 text-center text-gray-400">... 외 {preview.length - 20}건</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
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
