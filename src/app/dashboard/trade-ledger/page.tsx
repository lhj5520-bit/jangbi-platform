'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface LedgerRow {
  clientId: string
  clientName: string
  code: string
  carryOver: number
  debit: number
  credit: number
  balance: number
}

export default function TradeLedgerPage() {
  const supabase = createClient()
  const printAreaRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()

  const [dateFrom, setDateFrom] = useState(`${y}-${m}-01`)
  const [dateTo, setDateTo] = useState(`${y}-${m}-${String(lastDay).padStart(2, '0')}`)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [codeMap, setCodeMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => { load() }, [dateFrom, dateTo])

  async function load() {
    setLoading(true)

    // 1. 클라이언트 목록
    const { data: clients } = await supabase.from('clients').select('id, name, code').order('name')
    const clientList = clients ?? []
    const clientById = new Map<string, any>()
    for (const c of clientList) clientById.set(c.id, c)

    // 2. 현재 기간 매출계산서 (차변)
    const { data: invCurr } = await supabase.from('invoices')
      .select('id, client_id, supply_amount, vat_amount, total_amount')
      .gte('issue_date', dateFrom).lte('issue_date', dateTo)

    // 3. 이전 기간 매출계산서 (전기이월 차변)
    const { data: invPrev } = await supabase.from('invoices')
      .select('id, client_id, supply_amount, vat_amount, total_amount')
      .lt('issue_date', dateFrom)

    // 4. 전체 invoice id → client_id 맵 (은행 매칭용)
    const { data: allInv } = await supabase.from('invoices').select('id, client_id')
    const invClientMap = new Map<string, string>()
    for (const inv of allInv ?? []) {
      if (inv.client_id) invClientMap.set(inv.id, inv.client_id)
    }

    // 5. 현재 기간 입금 (대변) — matched_invoice_id로 발주처 역추적
    const { data: txCurr } = await supabase.from('bank_transactions')
      .select('deposit, matched_invoice_id')
      .gte('transaction_at', dateFrom).lte('transaction_at', dateTo)
      .not('matched_invoice_id', 'is', null)
      .gt('deposit', 0)

    // 6. 이전 기간 입금 (전기이월 대변)
    const { data: txPrev } = await supabase.from('bank_transactions')
      .select('deposit, matched_invoice_id')
      .lt('transaction_at', dateFrom)
      .not('matched_invoice_id', 'is', null)
      .gt('deposit', 0)

    // 집계 헬퍼
    const add = (map: Map<string, number>, key: string, val: number) =>
      map.set(key, (map.get(key) ?? 0) + val)

    const debitMap = new Map<string, number>()
    const creditMap = new Map<string, number>()
    const prevDebitMap = new Map<string, number>()
    const prevCreditMap = new Map<string, number>()

    const invAmt = (inv: any) => inv.total_amount ?? (inv.supply_amount ?? 0) + (inv.vat_amount ?? 0)

    for (const inv of invCurr ?? []) {
      if (inv.client_id) add(debitMap, inv.client_id, invAmt(inv))
    }
    for (const inv of invPrev ?? []) {
      if (inv.client_id) add(prevDebitMap, inv.client_id, invAmt(inv))
    }
    for (const tx of txCurr ?? []) {
      const cid = invClientMap.get(tx.matched_invoice_id)
      if (cid) add(creditMap, cid, tx.deposit ?? 0)
    }
    for (const tx of txPrev ?? []) {
      const cid = invClientMap.get(tx.matched_invoice_id)
      if (cid) add(prevCreditMap, cid, tx.deposit ?? 0)
    }

    // 활동 있는 클라이언트 목록
    const activeIds = new Set([
      ...debitMap.keys(), ...creditMap.keys(),
      ...prevDebitMap.keys(), ...prevCreditMap.keys(),
    ])

    const result: LedgerRow[] = []
    for (const clientId of activeIds) {
      const client = clientById.get(clientId)
      const carryOver = (prevDebitMap.get(clientId) ?? 0) - (prevCreditMap.get(clientId) ?? 0)
      const debit = debitMap.get(clientId) ?? 0
      const credit = creditMap.get(clientId) ?? 0
      const balance = carryOver + debit - credit
      if (carryOver === 0 && debit === 0 && credit === 0) continue
      result.push({
        clientId,
        clientName: client?.name ?? '알 수 없음',
        code: client?.code ?? '',
        carryOver,
        debit,
        credit,
        balance,
      })
    }

    // 코드 → 이름 순 정렬
    result.sort((a, b) => {
      if (a.code && b.code) return a.code.localeCompare(b.code)
      if (a.code) return -1
      if (b.code) return 1
      return a.clientName.localeCompare(b.clientName)
    })

    // 코드 상태 초기화 (로컬 편집용)
    const cm: Record<string, string> = {}
    for (const r of result) cm[r.clientId] = r.code
    setCodeMap(cm)
    setRows(result)
    setLoading(false)
  }

  async function handleCodeBlur(clientId: string) {
    const code = codeMap[clientId] ?? ''
    await supabase.from('clients').update({ code }).eq('id', clientId)
    // 행 코드도 업데이트
    setRows(prev => prev.map(r => r.clientId === clientId ? { ...r, code } : r)
      .sort((a, b) => {
        const ac = codeMap[a.clientId] ?? a.code
        const bc = codeMap[b.clientId] ?? b.code
        if (ac && bc) return ac.localeCompare(bc)
        if (ac) return -1
        if (bc) return 1
        return a.clientName.localeCompare(b.clientName)
      })
    )
  }

  function setMonth(offset: number) {
    const base = dateFrom ? new Date(dateFrom) : new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + offset)
    const ny = base.getFullYear()
    const nm = String(base.getMonth() + 1).padStart(2, '0')
    const nl = new Date(ny, base.getMonth() + 1, 0).getDate()
    setDateFrom(`${ny}-${nm}-01`)
    setDateTo(`${ny}-${nm}-${String(nl).padStart(2, '0')}`)
  }

  const fmt = (n: number) => n === 0 ? '' : n.toLocaleString()
  const totalCarry = rows.reduce((s, r) => s + r.carryOver, 0)
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0)

  const tdBase: React.CSSProperties = {
    border: '1px solid #bbb', padding: '4px 8px', fontSize: 12, verticalAlign: 'middle',
  }
  const thBase: React.CSSProperties = {
    ...tdBase, background: '#222', color: '#fff', fontWeight: 700, textAlign: 'center',
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #trade-ledger-print, #trade-ledger-print * { visibility: visible !important; }
          #trade-ledger-print { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
          input { border: none !important; outline: none !important; background: transparent !important; }
        }
      `}</style>

      <div className="p-4 md:p-8">
        {/* 컨트롤 */}
        <div className="no-print mb-6">
          <h1 className="text-xl font-bold text-gray-800 mb-4">거래처 원장(잔액)</h1>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-500">~</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => setMonth(-1)}
              className="px-3 py-2 text-sm rounded-lg border border-indigo-400 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">
              ◀ 전월
            </button>
            <button onClick={() => setMonth(0)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              이번달
            </button>
            <button onClick={() => setMonth(1)}
              className="px-3 py-2 text-sm rounded-lg border border-indigo-400 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">
              다음월 ▶
            </button>
            <button onClick={() => { setDateFrom('2020-01-01'); setDateTo(dateTo) }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              전체
            </button>
            <div className="ml-auto">
              <button onClick={() => window.print()}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
                🖨️ 인쇄 / PDF
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">💡 코드 칸을 클릭해서 직접 입력하면 저장됩니다.</p>
        </div>

        {/* 인쇄 영역 */}
        <div id="trade-ledger-print" ref={printAreaRef}
          style={{ fontFamily: '"Malgun Gothic", "맑은 고딕", sans-serif', maxWidth: 900 }}>
          {/* 문서 헤더 */}
          <div style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 6, letterSpacing: '0.05em' }}>
            거래처 원장( 잔액 )
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#555', marginBottom: 16 }}>
            {dateFrom} ~ {dateTo}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>
            <span>회사명: 주식회사 가온건설중기</span>
            <span>0108:외상매출금</span>
          </div>

          {/* 표 */}
          {loading ? (
            <div className="no-print text-center py-12 text-gray-400">불러오는 중...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, width: 64 }}>코 드</th>
                  <th style={{ ...thBase }}>거 래 처 명</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'right' }}>전기(월)이월</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'right' }}>차 변</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'right' }}>대 변</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'right' }}>잔 액</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...tdBase, textAlign: 'center', color: '#999', padding: '24px' }}>
                      해당 기간 데이터가 없습니다
                    </td>
                  </tr>
                ) : rows.map((r, i) => (
                  <tr key={r.clientId} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      <input
                        value={codeMap[r.clientId] ?? r.code}
                        onChange={e => setCodeMap(prev => ({ ...prev, [r.clientId]: e.target.value }))}
                        onBlur={() => handleCodeBlur(r.clientId)}
                        style={{ width: '100%', border: '1px solid #ddd', borderRadius: 4, textAlign: 'center',
                          padding: '1px 2px', fontSize: 12, background: '#fff', outline: 'none' }}
                        placeholder="코드"
                      />
                    </td>
                    <td style={{ ...tdBase }}>{r.clientName}</td>
                    <td style={{ ...tdBase, textAlign: 'right', color: r.carryOver > 0 ? '#333' : '#999' }}>
                      {fmt(r.carryOver)}
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>{fmt(r.debit)}</td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>{fmt(r.credit)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: r.balance !== 0 ? 600 : 400,
                      color: r.balance > 0 ? '#1a56db' : r.balance < 0 ? '#e02424' : '#999' }}>
                      {fmt(r.balance)}
                    </td>
                  </tr>
                ))}
                {/* 합계 행 */}
                <tr style={{ background: '#1a1a2e' }}>
                  <td colSpan={2} style={{ ...tdBase, textAlign: 'center', fontWeight: 700, color: '#fff', background: '#1a1a2e' }}>
                    합 계
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: '#fff', background: '#1a1a2e' }}>
                    {totalCarry ? totalCarry.toLocaleString() : ''}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: '#fff', background: '#1a1a2e' }}>
                    {totalDebit ? totalDebit.toLocaleString() : ''}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: '#fff', background: '#1a1a2e' }}>
                    {totalCredit ? totalCredit.toLocaleString() : ''}
                  </td>
                  <td style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: '#ffd700', background: '#1a1a2e' }}>
                    {totalBalance ? totalBalance.toLocaleString() : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
