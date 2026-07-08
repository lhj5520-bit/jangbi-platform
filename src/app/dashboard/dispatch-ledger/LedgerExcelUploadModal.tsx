'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
  onSaved: () => void
}

function parseDate(val: any): string {
  if (!val) return ''
  if (val instanceof Date) {
    // toISOString()은 UTC 기준 → 한국(UTC+9)에서 하루 밀림. 로컬 시간 사용
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const s = String(val).trim()
  const mMatch = s.match(/(\d{1,2})월\s*(\d{1,2})일/)
  if (mMatch) {
    const year = new Date().getFullYear()
    return `${year}-${String(mMatch[1]).padStart(2, '0')}-${String(mMatch[2]).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-')
  return ''
}

function parseNum(val: any): number {
  if (!val && val !== 0) return 0
  return Number(String(val).replace(/,/g, '')) || 0
}

export default function LedgerExcelUploadModal({ onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [errors, setErrors] = useState<string[]>([])
  const [equipMap, setEquipMap] = useState<Record<string, any>>({})
  const [equipList, setEquipList] = useState<any[]>([])
  const [clientList, setClientList] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [matchPlate, setMatchPlate] = useState('')
  const [matchClient, setMatchClient] = useState('')

  useEffect(() => {
    supabase.from('equipment').select('id, plate_no, supplier_id, supplier:suppliers(name)')
      .then(({ data }) => {
        const map: Record<string, any> = {}
        const list: any[] = []
        ;(data ?? []).forEach((e: any) => {
          if (e.plate_no) {
            const key = String(e.plate_no).replace(/\s/g, '')
            const v = { equipment_id: e.id, supplier_id: e.supplier_id, supplier_name: e.supplier?.name ?? '', plate_no: key }
            map[key] = v
            list.push(v)
          }
        })
        setEquipMap(map)
        setEquipList(list)
      })
    supabase.from('dispatches').select('client_name').not('client_name', 'is', null).neq('client_name', '')
      .then(({ data }) => {
        const names = Array.from(new Set((data ?? []).map((r: any) => r.client_name).filter(Boolean))) as string[]
        setClientList(names.sort())
      })
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setErrors([])
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const XLSX = await import('xlsx')
        const data = ev.target?.result as ArrayBuffer
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        if (!wb.SheetNames.length) { setErrors(['엑셀에 시트가 없습니다.']); setLoading(false); return }
        let raw: any[][] = []
        let usedSheet = ''
        for (const sn of wb.SheetNames) {
          const ws = wb.Sheets[sn]
          if (!ws) continue
          const r: any[][] = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as any[][]) || []
          if (r.length > 1) { raw = r; usedSheet = sn; break }
        }
        if (!raw.length) { setErrors([`데이터를 찾을 수 없습니다. 시트: ${wb.SheetNames.join(', ')}`]); setLoading(false); return }
        const KNOWN = ['거래일', '차종', '차량번호', '단가', '가동시간', '차주명', '거래처', '현장']
        let headerIdx = 0
        for (let i = 0; i < Math.min(raw.length, 10); i++) {
          if (raw[i] && raw[i].some((c: any) => KNOWN.some(k => String(c).includes(k)))) { headerIdx = i; break }
        }
        if (!raw[headerIdx]) { setErrors([`헤더 행을 찾을 수 없습니다. 시트명: ${wb.SheetNames[0]}, 행수: ${raw.length}`]); setLoading(false); return }
        const headers = raw[headerIdx].map((h: any) => String(h).trim())
        const col = (row: any[], names: string[]) => {
          for (const n of names) {
            const idx = headers.findIndex((h: string) => h.includes(n))
            if (idx >= 0 && row[idx] !== '') return row[idx]
          }
          return ''
        }
        const rows = raw.slice(headerIdx + 1).filter((r: any[]) => r.some((c: any) => c !== ''))
        const parsed = rows.map((r: any[], i: number) => {
          const plateRaw = String(col(r, ['차량번호', '번호'])).trim().replace(/\s/g, '')
          const matched = equipMap[plateRaw]
            ?? Object.entries(equipMap).find(([k]) => k.endsWith(plateRaw) || plateRaw.endsWith(k))?.[1]
            ?? null
          const qty = parseNum(col(r, ['가동시간', '시간']))
          const unitPrice = parseNum(col(r, ['단가']))
          const salesAmt = parseNum(col(r, ['매출액', '매출']))
          return {
            _row: i + 1,
            log_date: parseDate(col(r, ['거래일', '날짜', '작업일'])),
            equipment_type: String(col(r, ['차종', '장비종류']) || '').trim(),
            plate_no: plateRaw,
            quantity: qty,
            unit_price: unitPrice,
            sales_amount: salesAmt || qty * unitPrice,
            driver_name: String(col(r, ['차주명', '차주', '운전자'])).trim(),
            client_name: String(col(r, ['거래처명', '거래처', '발주처'])).trim(),
            site_name: String(col(r, ['현장명', '현장'])).trim(),
            work_type: String(col(r, ['작업장치', '작업명', '작업']) || '').trim(),
            matched,
            equipment_id: matched?.equipment_id ?? null,
            supplier_id: matched?.supplier_id ?? null,
            supplier_name: matched?.supplier_name ?? '',
          }
        }).filter((r: any) => r.log_date)
        setPreview(parsed)
        setSelected(new Set())
        setStep('preview')
      } catch (err: any) {
        setErrors(['파일 읽기 오류: ' + (err?.message ?? '알 수 없는 오류')])
      } finally {
        setLoading(false)
        e.target.value = ''
      }
    }
    reader.onerror = () => { setErrors(['파일 읽기 실패']); setLoading(false) }
    reader.readAsArrayBuffer(file)
  }

  function applyEquipMatch() {
    if (!matchPlate || selected.size === 0) return
    const eq = equipMap[matchPlate] ?? equipList.find(e => e.plate_no === matchPlate)
    if (!eq) return
    setPreview(prev => prev.map((r, i) =>
      selected.has(i) ? { ...r, matched: eq, equipment_id: eq.equipment_id, supplier_id: eq.supplier_id, supplier_name: eq.supplier_name } : r
    ))
    setMatchPlate('')
  }

  function applyClientMatch() {
    if (!matchClient || selected.size === 0) return
    setPreview(prev => prev.map((r, i) => selected.has(i) ? { ...r, client_name: matchClient } : r))
    setMatchClient('')
  }

  function toggleRow(i: number) {
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  async function handleSave() {
    setSaving(true)
    const errs: string[] = []
    for (const row of preview) {
      const logPayload = {
        log_date: row.log_date,
        quantity: row.quantity || null,
        engineer_daily_wage: row.sales_amount || null,
        work_type_1: row.work_type || null,
      }

      // 같은 날짜 + 같은 차량(equipment_id 또는 equipment_text)이 이미 있으면 UPDATE
      let existQuery = supabase.from('dispatches').select('id').eq('start_date', row.log_date)
      if (row.equipment_id) existQuery = existQuery.eq('equipment_id', row.equipment_id)
      else {
        const eqText = [row.equipment_type, row.plate_no].filter(Boolean).join(' ') || null
        if (eqText) existQuery = existQuery.ilike('equipment_text', `%${row.plate_no}%`)
        else existQuery = existQuery.is('equipment_text', null)
      }
      const { data: existing } = await existQuery.limit(1).maybeSingle()

      if (existing?.id) {
        // 기존 배차 업데이트
        await supabase.from('dispatches').update({
          client_name: row.client_name || null,
          site_name: row.site_name || null,
          driver_name: row.driver_name || null,
          client_unit_price: row.unit_price || null,
        }).eq('id', existing.id)
        const { data: existLog } = await supabase.from('daily_logs').select('id').eq('dispatch_id', existing.id).maybeSingle()
        if (existLog?.id) {
          await supabase.from('daily_logs').update(logPayload).eq('id', existLog.id)
        } else {
          const { error: le } = await supabase.from('daily_logs').insert({ ...logPayload, dispatch_id: existing.id })
          if (le) errs.push(`행 ${row._row}: ${le.message}`)
        }
      } else {
        // 신규 삽입
        const dp: any = {
          site_name: row.site_name || null,
          client_name: row.client_name || null,
          driver_name: row.driver_name || null,
          start_date: row.log_date,
          unit_type: 'hour',
          client_unit_price: row.unit_price || null,
          status: 'active',
        }
        if (row.equipment_id) { dp.equipment_id = row.equipment_id; dp.supplier_id = row.supplier_id }
        else dp.equipment_text = [row.equipment_type, row.plate_no].filter(Boolean).join(' ') || null
        const { data: disp, error: de } = await supabase.from('dispatches').insert(dp).select('id').single()
        if (de || !disp) { errs.push(`행 ${row._row}: ${de?.message}`); continue }
        const { error: le } = await supabase.from('daily_logs').insert({ ...logPayload, dispatch_id: disp.id })
        if (le) errs.push(`행 ${row._row}: ${le.message}`)
      }
    }
    setSaving(false)
    if (errs.length > 0) { setErrors(errs); return }
    onSaved()
  }

  const matchedCount = preview.filter(r => r.matched).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-900">배차내역 엑셀 업로드</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {errors.length > 0 && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <div className="text-center py-10">
              {loading ? (
                <div className="text-gray-500">파일 읽는 중...</div>
              ) : (
                <>
                  <div className="text-5xl mb-4">📂</div>
                  <p className="text-gray-600 mb-2 font-medium">배차내역 엑셀 파일을 선택하세요</p>
                  <p className="text-xs text-gray-400 mb-6">헤더: 거래일, 차종, 차량번호, 가동시간, 단가, 매출액, 차주명, 거래처명, 현장명</p>
                  <button onClick={() => fileRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg">
                    파일 선택
                  </button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                </>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <p className="text-sm text-gray-600">총 <strong>{preview.length}건</strong></p>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">🟢 매칭 {matchedCount}건</span>
                {preview.length - matchedCount > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">🟡 미매칭 {preview.length - matchedCount}건</span>}
              </div>

              {selected.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-bold text-blue-700">{selected.size}행 선택</span>
                  <select value={matchPlate} onChange={e => setMatchPlate(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none">
                    <option value="">-- 차량 선택 --</option>
                    {equipList.map(e => <option key={e.equipment_id} value={e.plate_no}>{e.plate_no} ({e.supplier_name})</option>)}
                  </select>
                  <button onClick={applyEquipMatch} disabled={!matchPlate}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">
                    차번호 매칭
                  </button>
                  <input value={matchClient} onChange={e => setMatchClient(e.target.value)}
                    placeholder="발주처..." list="cl-list"
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 w-36 focus:outline-none" />
                  <datalist id="cl-list">{clientList.map(c => <option key={c} value={c} />)}</datalist>
                  <button onClick={applyClientMatch} disabled={!matchClient}
                    className="text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">
                    발주처 매칭
                  </button>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 ml-auto">✕</button>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-2 border border-gray-200">
                        <input type="checkbox"
                          checked={selected.size === preview.length && preview.length > 0}
                          onChange={() => setSelected(selected.size === preview.length ? new Set() : new Set(preview.map((_, i) => i)))} />
                      </th>
                      {['매칭','날짜','차종','차량번호','작업장치','가동시간','단가','매출액','차주명','발주처','현장','연결업체'].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-semibold text-gray-600 border border-gray-200 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} onClick={() => toggleRow(i)}
                        className={`cursor-pointer ${selected.has(i) ? 'bg-blue-100' : r.matched ? 'bg-green-50/30 hover:bg-green-50' : 'bg-amber-50/30 hover:bg-amber-50'}`}>
                        <td className="px-2 py-1.5 border border-gray-100 text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} />
                        </td>
                        <td className="px-2 py-1.5 border border-gray-100 text-center">{r.matched ? '🟢' : '🟡'}</td>
                        <td className="px-2 py-1.5 border border-gray-100 whitespace-nowrap">{r.log_date}</td>
                        <td className="px-2 py-1.5 border border-gray-100">{r.equipment_type}</td>
                        <td className="px-2 py-1.5 border border-gray-100 font-mono">{r.plate_no}</td>
                        <td className="px-2 py-1.5 border border-gray-100">{r.work_type}</td>
                        <td className="px-2 py-1.5 border border-gray-100 text-right">{r.quantity || ''}</td>
                        <td className="px-2 py-1.5 border border-gray-100 text-right">{r.unit_price ? r.unit_price.toLocaleString() : ''}</td>
                        <td className="px-2 py-1.5 border border-gray-100 text-right font-medium text-blue-700">{r.sales_amount ? r.sales_amount.toLocaleString() : ''}</td>
                        <td className="px-2 py-1.5 border border-gray-100">{r.driver_name}</td>
                        <td className="px-2 py-1.5 border border-gray-100">{r.client_name}</td>
                        <td className="px-2 py-1.5 border border-gray-100">{r.site_name}</td>
                        <td className="px-2 py-1.5 border border-gray-100 text-green-700">{r.supplier_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
          {step === 'preview' ? (
            <>
              <button onClick={() => { setStep('upload'); setPreview([]); setErrors([]); setSelected(new Set()) }}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                ← 다시 선택
              </button>
              <button onClick={handleSave} disabled={saving || preview.length === 0}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl">
                {saving ? '저장 중...' : `✓ ${preview.length}건 등록`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">취소</button>
          )}
        </div>
      </div>
    </div>
  )
}
