'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface ExistingTx {
  id: string
  transaction_at: string
  withdrawal: number | null
  deposit: number | null
  counterparty: string | null
  matched_invoice_id: string | null
  matched_purchase_id: string | null
  matched_extra_ids: string | null
}

export default function BankUploadModal({ onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview'>('upload')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [overlapTxs, setOverlapTxs] = useState<ExistingTx[]>([])
  const [deleteIds, setDeleteIds] = useState<Set<string>>(new Set())

  const EXPENSE_RULES: { pattern: RegExp; category: string }[] = [
    { pattern: /카드대금|기업카드|법인카드/i,          category: '카드대금' },
    { pattern: /세무서|소득세|부가가치세|법인세|지방소득세|세금/i, category: '세금' },
    { pattern: /세무사|세무법인|회계사/i,             category: '세무비용' },
    { pattern: /수수료|UMS/i,                        category: '기타수수료' },
    { pattern: /이자|캐피탈|캐피|금융|리스/i,          category: '대출이자' },
    { pattern: /주유|주유소|가스|LPG|오일/i,           category: '주유비' },
    { pattern: /급여|월급|임금|인건비/i,               category: '급여' },
    { pattern: /임대|전세|보증금|임차/i,              category: '임대료' },
  ]

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    let headerIdx = -1
    for (let i = 0; i < Math.min(raw.length, 15); i++) {
      if (raw[i].some((c: any) => String(c).includes('거래일시') || String(c).includes('거래 일시'))) { headerIdx = i; break }
    }
    if (headerIdx === -1) { alert('올바른 통장 거래내역 파일이 아닙니다.'); return }

    const headerRow = raw[headerIdx]
    const colOffset = headerRow.findIndex((c: any) => String(c).includes('거래일시') || String(c).includes('거래 일시'))
    const col = (i: number) => colOffset + i

    const rows = raw.slice(headerIdx + 1).filter(r => r[col(0)] && String(r[col(0)]).includes('/'))
    let parsed = rows.map(r => ({
      transaction_at: String(r[col(0)]).trim(),
      withdrawal: r[col(1)] ? Number(String(r[col(1)]).replace(/,/g, '')) : null,
      deposit: r[col(2)] ? Number(String(r[col(2)]).replace(/,/g, '')) : null,
      balance: r[col(3)] ? Number(String(r[col(3)]).replace(/,/g, '')) : null,
      transaction_type: String(r[col(4)] ?? '').trim(),
      counterparty: String(r[col(5)] ?? '').trim(),
      branch: String(r[col(6)] ?? '').trim(),
      memo: String(r[col(7)] ?? '').trim() || null,
    })).filter(r => r.counterparty)

    if (filterFrom) {
      const from = filterFrom.replace(/-/g, '/')
      parsed = parsed.filter(r => r.transaction_at >= from)
    }
    if (filterTo) {
      const to = filterTo.replace(/-/g, '/') + ' 99:99:99'
      parsed = parsed.filter(r => r.transaction_at <= to)
    }

    setPreview(parsed)

    if (parsed.length > 0) {
      const dates = parsed.map(r => r.transaction_at).sort()
      const minDate = dates[0]
      const maxDate = dates[dates.length - 1]

      const { data: existing } = await supabase
        .from('bank_transactions')
        .select('id, transaction_at, withdrawal, deposit, counterparty, matched_invoice_id, matched_purchase_id, matched_extra_ids')
        .gte('transaction_at', minDate)
        .lte('transaction_at', maxDate)
        .order('transaction_at', { ascending: false })

      if (existing && existing.length > 0) {
        setOverlapTxs(existing)
        // 매칭 안 된 것만 기본 선택
        setDeleteIds(new Set(existing.filter(t => !t.matched_invoice_id && !t.matched_purchase_id && t.matched_extra_ids !== 'forced').map(t => t.id)))
      } else {
        setOverlapTxs([])
        setDeleteIds(new Set())
      }
    } else {
      setOverlapTxs([])
      setDeleteIds(new Set())
    }

    setStep('preview')
  }

  async function handleImport() {
    if (!preview.length) return
    setSaving(true)
    const { error } = await supabase.from('bank_transactions').insert(preview)
    if (error) { setSaving(false); alert('오류: ' + error.message); return }

    const expenses = preview
      .filter(tx => tx.withdrawal && tx.withdrawal > 0)
      .map(tx => {
        const name = tx.counterparty ?? ''
        const memo = tx.memo ?? ''
        const rule = EXPENSE_RULES.find(r => r.pattern.test(name) || r.pattern.test(memo))
        if (!rule) return null
        return {
          category: rule.category,
          amount: tx.withdrawal,
          expense_date: tx.transaction_at.slice(0, 10).replace(/\//g, '-'),
          memo: name,
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)

    if (expenses.length > 0) {
      await supabase.from('expenses').insert(expenses)
    }

    setSaving(false)
    onSaved()
  }

  async function handleDeleteAndImport() {
    if (deleteIds.size === 0) { await handleImport(); return }
    setSaving(true)
    const { error } = await supabase.from('bank_transactions').delete().in('id', Array.from(deleteIds))
    if (error) { setSaving(false); alert('삭제 오류: ' + error.message); return }
    setOverlapTxs([])
    setDeleteIds(new Set())
    await handleImport()
  }

  function toggleId(id: string) {
    setDeleteIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const hasOverlap = overlapTxs.length > 0
  const canImport = !hasOverlap || deleteIds.size === overlapTxs.length || overlapTxs.every(t => deleteIds.has(t.id) || (!t.matched_invoice_id && !t.matched_purchase_id))

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-900">통장 거래내역 업로드</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <div>
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <p className="text-xs font-medium text-gray-600 mb-3">업로드 기간 설정 <span className="text-gray-400 font-normal">(비워두면 전체)</span></p>
                <div className="flex items-center gap-2">
                  <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-gray-400 text-sm shrink-0">~</span>
                  <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="text-center py-6">
                <div className="text-5xl mb-4">🏦</div>
                <p className="text-gray-600 mb-2 font-medium">농협 통장 거래내역 엑셀 파일을 선택하세요</p>
                <p className="text-xs text-gray-400 mb-6">.xls / .xlsx 형식 지원</p>
                <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={handleFile} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg">
                  파일 선택
                </button>
              </div>
            </div>
          )}
          {step === 'preview' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">총 <span className="font-bold text-gray-800">{preview.length}건</span> 등록 예정</p>
                {(filterFrom || filterTo) && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                    {filterFrom || '처음'} ~ {filterTo || '끝'}
                  </span>
                )}
              </div>

              {/* 겹치는 기존 내역 */}
              {hasOverlap && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-red-500">⚠️</span>
                      <p className="text-sm font-semibold text-red-700">기간 중복 — 기존 {overlapTxs.length}건</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDeleteIds(new Set(overlapTxs.map(t => t.id)))}
                        className="text-xs text-red-600 underline">전체선택</button>
                      <button onClick={() => setDeleteIds(new Set())}
                        className="text-xs text-gray-500 underline">전체해제</button>
                    </div>
                  </div>
                  <p className="text-xs text-red-500 mb-3">삭제할 항목을 선택하세요. 매칭된 항목은 주의해서 선택하세요.</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {overlapTxs.map(tx => {
                      const isMatched = !!(tx.matched_invoice_id || tx.matched_purchase_id || tx.matched_extra_ids === 'forced')
                      const checked = deleteIds.has(tx.id)
                      return (
                        <label key={tx.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs
                            ${checked ? 'bg-red-100' : 'bg-white'}
                            ${isMatched ? 'border border-orange-300' : 'border border-gray-200'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleId(tx.id)}
                            className="accent-red-500 shrink-0" />
                          <span className="text-gray-500 shrink-0 w-32">{(tx.transaction_at ?? '').slice(0, 16)}</span>
                          <span className="font-medium text-gray-800 flex-1 truncate">{tx.counterparty}</span>
                          {tx.withdrawal ? <span className="text-red-500 shrink-0">{tx.withdrawal.toLocaleString()}</span>
                            : <span className="text-blue-600 shrink-0">{tx.deposit?.toLocaleString()}</span>}
                          {isMatched && <span className="text-orange-500 shrink-0 font-medium">매칭됨</span>}
                        </label>
                      )
                    })}
                  </div>
                  {deleteIds.size > 0 && (
                    <p className="text-xs text-red-600 mt-2 font-medium">{deleteIds.size}건 삭제 예정</p>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2">거래일시</th>
                      <th className="text-left px-3 py-2">거래처</th>
                      <th className="text-right px-3 py-2">출금</th>
                      <th className="text-right px-3 py-2">입금</th>
                      <th className="text-right px-3 py-2">잔액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(0, 30).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-500">{r.transaction_at}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-800">{r.counterparty}</td>
                        <td className="px-3 py-1.5 text-right text-red-500">{r.withdrawal ? r.withdrawal.toLocaleString() : '-'}</td>
                        <td className="px-3 py-1.5 text-right text-blue-600">{r.deposit ? r.deposit.toLocaleString() : '-'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{r.balance?.toLocaleString()}</td>
                      </tr>
                    ))}
                    {preview.length > 30 && (
                      <tr><td colSpan={5} className="px-3 py-2 text-center text-gray-400">... 외 {preview.length - 30}건</td></tr>
                    )}
                    {preview.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">해당 기간에 거래내역이 없습니다</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
          {step === 'preview' ? (
            <>
              <button onClick={() => { setStep('upload'); setPreview([]); setOverlapTxs([]); setDeleteIds(new Set()) }}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                ← 다시 선택
              </button>
              <button
                onClick={hasOverlap ? handleDeleteAndImport : handleImport}
                disabled={saving || !preview.length}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 text-white text-sm font-medium">
                {saving ? '처리 중...'
                  : hasOverlap && deleteIds.size > 0 ? `🗑 ${deleteIds.size}건 삭제 후 ${preview.length}건 등록`
                  : hasOverlap ? `${preview.length}건 등록 (중복 유지)`
                  : `✓ ${preview.length}건 등록`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          )}
        </div>
      </div>
    </div>
  )
}
