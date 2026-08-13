'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface LedgerRow {
  clientId: string
  clientName: string
  representative: string
  code: string
  carryOver: number
  debit: number
  credit: number
  balance: number
}

interface InvDetail {
  issue_date: string
  amount: number
  project_name?: string
}

interface TxDetail {
  transaction_at: string
  deposit: number
  counterparty?: string
}

interface ClientDetail {
  clientName: string
  invoices: InvDetail[]
  payments: TxDetail[]
}

export default function TradeLedgerPage() {
  const supabase = createClient()
  const printAreaRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')

  const [dateFrom, setDateFrom] = useState(`${y}-01-01`)
  const [dateTo, setDateTo] = useState(`${y}-${m}-${d}`)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [codeMap, setCodeMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<ClientDetail | null>(null)
  const [balanceOnly, setBalanceOnly] = useState(true)

  // 원본 데이터 (팝업용)
  const [allInvoicesRef, setAllInvoicesRef] = useState<any[]>([])
  const [allTxRef, setAllTxRef] = useState<any[]>([])
  const [invClientMapRef, setInvClientMapRef] = useState<Map<string, string>>(new Map())

  useEffect(() => { load() }, [dateFrom, dateTo])

  async function load() {
    setLoading(true)
    setHiddenIds(new Set())
    try {

    let { data: clients, error: clientsErr } = await supabase.from('clients').select('id, name, code').order('name')
    if (clientsErr) {
      // code 컬럼 미존재 시 fallback
      const fb = await supabase.from('clients').select('id, name').order('name')
      clients = (fb.data ?? []).map((c: any) => ({ ...c, code: null }))
    }
    const clientList = clients ?? []
    const clientById = new Map<string, any>()
    const clientByName = new Map<string, string>()
    for (const c of clientList) {
      clientById.set(c.id, c)
      if (c.name) clientByName.set(c.name.trim(), c.id)
    }

    const dateToFull = dateTo + 'T23:59:59'

    const { data: allInvRaw, error: invErr } = await supabase.from('invoices')
      .select('id, client_id, client_name, representative, supply_amount, vat_amount, total_amount, issue_date')
    const allInvoices = allInvRaw ?? []
    setAllInvoicesRef(allInvoices)

    const { data: allTxRaw, error: txErr } = await supabase.from('bank_transactions')
      .select('deposit, transaction_at, matched_invoice_id, counterparty')
      .not('matched_invoice_id', 'is', null)
    const allTx = allTxRaw ?? []
    setAllTxRef(allTx)

    // invoice_id → client_name (key로 사용)
    // client_name 없으면 client_id → clients.name 폴백
    const resolveClientName = (inv: any): string => {
      if (inv.client_name?.trim()) return inv.client_name.trim()
      if (inv.client_id) return clientById.get(inv.client_id)?.name?.trim() ?? ''
      return ''
    }

    const invNameMap = new Map<string, string>()
    const debitMap = new Map<string, number>()
    const prevDebitMap = new Map<string, number>()
    const repMap = new Map<string, string>() // clientName → representative

    const invAmt = (inv: any) =>
      Number(inv.total_amount) || (Number(inv.supply_amount) + Number(inv.vat_amount)) || 0

    for (const inv of allInvoices) {
      const name = resolveClientName(inv)
      if (!name) continue
      invNameMap.set(inv.id, name)
      if (inv.representative && !repMap.has(name)) repMap.set(name, inv.representative)
      const amt = invAmt(inv)
      if (!amt) continue
      const d = (inv.issue_date || '').slice(0, 10)
      if (d >= dateFrom && d <= dateTo) {
        debitMap.set(name, (debitMap.get(name) ?? 0) + amt)
      } else if (d < dateFrom) {
        prevDebitMap.set(name, (prevDebitMap.get(name) ?? 0) + amt)
      }
    }

    // invoice_id → client_name 맵을 ref에 저장 (팝업용 — clientId처럼 사용)
    setInvClientMapRef(invNameMap as any)

    const creditMap = new Map<string, number>()
    const prevCreditMap = new Map<string, number>()

    for (const tx of allTx) {
      const name = invNameMap.get(tx.matched_invoice_id)
      if (!name) continue
      const dep = Number(tx.deposit) || 0
      if (!dep) continue
      const txAt = (tx.transaction_at ?? '').replace(/\//g, '-').slice(0, 19)
      const txDate = txAt.slice(0, 10)
      if (txDate >= dateFrom && txAt <= dateToFull) {
        creditMap.set(name, (creditMap.get(name) ?? 0) + dep)
      } else if (txDate < dateFrom) {
        prevCreditMap.set(name, (prevCreditMap.get(name) ?? 0) + dep)
      }
    }

    const activeNames = new Set([
      ...debitMap.keys(), ...creditMap.keys(),
      ...prevDebitMap.keys(), ...prevCreditMap.keys(),
    ])

    const result: LedgerRow[] = []
    for (const clientName of activeNames) {
      // clients 테이블에서 일치하는 항목 찾기 (코드용)
      const client = clientByName.get(clientName) ? clientById.get(clientByName.get(clientName)!) : undefined
      const clientId = client?.id ?? clientName // ID 없으면 이름을 키로
      const carryOver = (prevDebitMap.get(clientName) ?? 0) - (prevCreditMap.get(clientName) ?? 0)
      const debit = debitMap.get(clientName) ?? 0
      const credit = creditMap.get(clientName) ?? 0
      const balance = carryOver + debit - credit
      if (carryOver === 0 && debit === 0 && credit === 0) continue
      result.push({
        clientId,
        clientName,
        representative: repMap.get(clientName) ?? '',
        code: client?.code ?? '',
        carryOver,
        debit,
        credit,
        balance,
      })
    }

    result.sort((a, b) => {
      if (a.code && b.code) return a.code.localeCompare(b.code)
      if (a.code) return -1
      if (b.code) return 1
      return a.clientName.localeCompare(b.clientName)
    })

    const cm: Record<string, string> = {}
    for (const r of result) cm[r.clientId] = r.code
    setCodeMap(cm)
    setRows(result)
    } catch (e) {
      console.error('trade-ledger load error', e)
    } finally {
      setLoading(false)
    }
  }

  function openDetail(row: LedgerRow) {
    const dateToFull = dateTo + 'T23:59:59'

    const invs: InvDetail[] = allInvoicesRef
      .filter(inv => {
        const name = (inv.client_name || '').trim()
        const d = (inv.issue_date || '').slice(0, 10)
        return name === row.clientName && d >= dateFrom && d <= dateTo
      })
      .map(inv => ({
        issue_date: (inv.issue_date || '').slice(0, 10),
        amount: Number(inv.total_amount) || (Number(inv.supply_amount) + Number(inv.vat_amount)) || 0,
        project_name: '',
      }))
      .sort((a, b) => a.issue_date.localeCompare(b.issue_date))

    const pays: TxDetail[] = allTxRef
      .filter(tx => {
        const name = (invClientMapRef as any).get(tx.matched_invoice_id)
        const txDate = (tx.transaction_at ?? '').replace(/\//g, '-').slice(0, 10)
        return name === row.clientName && txDate >= dateFrom && txDate <= dateTo && Number(tx.deposit) > 0
      })
      .map(tx => ({
        transaction_at: (tx.transaction_at ?? '').replace(/\//g, '-').slice(0, 10),
        deposit: Number(tx.deposit) || 0,
        counterparty: tx.counterparty ?? '',
      }))
      .sort((a, b) => a.transaction_at.localeCompare(b.transaction_at))

    setDetail({ clientName: row.clientName, invoices: invs, payments: pays })
  }

  async function handleCodeBlur(clientId: string) {
    const code = codeMap[clientId] ?? ''
    await supabase.from('clients').update({ code }).eq('id', clientId)
    setRows(prev => prev.map(r => r.clientId === clientId ? { ...r, code } : r))
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
  const visibleRows = rows.filter(r => !hiddenIds.has(r.clientId) && (!balanceOnly || r.balance !== 0))
  const totalCarry = visibleRows.reduce((s, r) => s + r.carryOver, 0)
  const totalDebit = visibleRows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = visibleRows.reduce((s, r) => s + r.credit, 0)
  const totalBalance = visibleRows.reduce((s, r) => s + r.balance, 0)

  const tdBase: React.CSSProperties = {
    border: '1px solid #bbb', padding: '4px 8px', fontSize: 12, verticalAlign: 'middle',
  }
  const thBase: React.CSSProperties = {
    ...tdBase, background: '#222', color: '#fff', fontWeight: 700, textAlign: 'center',
  }

  return (
    <>
      <style>{`
        .print-only { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          #trade-ledger-print, #trade-ledger-print * { visibility: visible !important; }
          #trade-ledger-print { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-only { display: inline !important; }
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
            <button onClick={() => {
              const n = new Date(); const ny = n.getFullYear(); const nm = String(n.getMonth()+1).padStart(2,'0')
              const nd = String(n.getDate()).padStart(2,'0')
              setDateFrom(`${ny}-01-01`); setDateTo(`${ny}-${nm}-${nd}`)
            }} className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
              이번달
            </button>
            <button onClick={() => setMonth(1)}
              className="px-3 py-2 text-sm rounded-lg border border-indigo-400 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">
              다음월 ▶
            </button>
            {hiddenIds.size > 0 && (
              <button onClick={() => setHiddenIds(new Set())}
                className="px-3 py-2 text-sm rounded-lg border border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100">
                숨긴 항목 복원 ({hiddenIds.size})
              </button>
            )}
            <button
              onClick={() => setBalanceOnly(v => !v)}
              className={`px-3 py-2 text-sm rounded-lg border font-medium ${balanceOnly ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              잔액 있는 것만
            </button>
            <div className="ml-auto">
              <button onClick={() => window.print()}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
                🖨️ 인쇄 / PDF
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            💡 코드 칸 클릭 → 저장 | 거래처명 클릭 → 계산서·입금 내역 | 삭제 → 해당 행 숨김
          </p>
        </div>

        {/* 인쇄 영역 */}
        <div id="trade-ledger-print" ref={printAreaRef}
          style={{ fontFamily: '"Malgun Gothic", "맑은 고딕", sans-serif', maxWidth: 960 }}>
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

          {loading ? (
            <div className="no-print text-center py-12 text-gray-400">불러오는 중...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thBase, width: 64 }}>코 드</th>
                  <th style={{ ...thBase }}>거 래 처 명</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'center' }}>전기(월)이월</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'center' }}>차 변</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'center' }}>대 변</th>
                  <th style={{ ...thBase, width: 120, textAlign: 'center' }}>잔 액</th>
                  <th className="no-print" style={{ ...thBase, width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ ...tdBase, textAlign: 'center', color: '#999', padding: '24px' }}>
                      해당 기간 데이터가 없습니다
                    </td>
                  </tr>
                ) : visibleRows.map((r, i) => (
                  <tr key={r.clientId} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ ...tdBase, textAlign: 'center' }}>
                      <input
                        value={codeMap[r.clientId] ?? r.code}
                        onChange={e => setCodeMap(prev => ({ ...prev, [r.clientId]: e.target.value }))}
                        onBlur={() => handleCodeBlur(r.clientId)}
                        style={{ width: '100%', border: '1px solid #ddd', borderRadius: 4, textAlign: 'center',
                          padding: '1px 4px', fontSize: 12, background: '#fff', outline: 'none' }}
                        placeholder="코드"
                      />
                    </td>
                    <td style={{ ...tdBase }}>
                      <button
                        onClick={() => openDetail(r)}
                        className="no-print"
                        style={{ textAlign: 'left', color: '#1a56db', textDecoration: 'underline',
                          cursor: 'pointer', background: 'none', border: 'none', fontSize: 12, padding: 0 }}>
                        {r.clientName}
                      </button>
                      {r.representative && (
                        <span className="no-print" style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>
                          {r.representative}
                        </span>
                      )}
                      <span className="print-only" style={{ fontSize: 12 }}>
                        {r.clientName}{r.representative ? ` ${r.representative}` : ''}
                      </span>
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right', color: r.carryOver > 0 ? '#333' : '#999' }}>
                      {fmt(r.carryOver)}
                    </td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>{fmt(r.debit)}</td>
                    <td style={{ ...tdBase, textAlign: 'right' }}>{fmt(r.credit)}</td>
                    <td style={{ ...tdBase, textAlign: 'right', fontWeight: r.balance !== 0 ? 600 : 400,
                      color: r.balance > 0 ? '#1a56db' : r.balance < 0 ? '#e02424' : '#999' }}>
                      {fmt(r.balance)}
                    </td>
                    <td className="no-print" style={{ ...tdBase, textAlign: 'center', padding: '2px 4px' }}>
                      <button
                        onClick={() => setHiddenIds(prev => new Set([...prev, r.clientId]))}
                        style={{ fontSize: 11, color: '#e02424', background: '#fff5f5',
                          border: '1px solid #fca5a5', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
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
                  <td className="no-print" style={{ ...tdBase, background: '#1a1a2e', border: '1px solid #444' }} />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 거래처 상세 팝업 */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-800">{detail.clientName}</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* 계산서 발행 */}
              <div>
                <div className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">
                  📄 계산서 발행 ({dateFrom} ~ {dateTo})
                </div>
                {detail.invoices.length === 0 ? (
                  <p className="text-xs text-gray-400">해당 기간 계산서 없음</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-blue-50">
                        <th className="border border-gray-200 px-2 py-1 text-left">발행일</th>
                        <th className="border border-gray-200 px-2 py-1 text-left">현장</th>
                        <th className="border border-gray-200 px-2 py-1 text-right">금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.invoices.map((inv, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-2 py-1">{inv.issue_date}</td>
                          <td className="border border-gray-200 px-2 py-1 text-gray-500">{inv.project_name || '-'}</td>
                          <td className="border border-gray-200 px-2 py-1 text-right font-medium">
                            {inv.amount.toLocaleString()}원
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-bold">
                        <td colSpan={2} className="border border-gray-200 px-2 py-1 text-right">합계</td>
                        <td className="border border-gray-200 px-2 py-1 text-right">
                          {detail.invoices.reduce((s, i) => s + i.amount, 0).toLocaleString()}원
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* 입금 내역 */}
              <div>
                <div className="text-xs font-bold text-green-700 mb-2 uppercase tracking-wide">
                  💰 입금 내역 ({dateFrom} ~ {dateTo})
                </div>
                {detail.payments.length === 0 ? (
                  <p className="text-xs text-gray-400">해당 기간 입금 없음</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-green-50">
                        <th className="border border-gray-200 px-2 py-1 text-left">입금일</th>
                        <th className="border border-gray-200 px-2 py-1 text-left">거래처</th>
                        <th className="border border-gray-200 px-2 py-1 text-right">입금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.payments.map((tx, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="border border-gray-200 px-2 py-1">{tx.transaction_at}</td>
                          <td className="border border-gray-200 px-2 py-1 text-gray-500">{tx.counterparty || '-'}</td>
                          <td className="border border-gray-200 px-2 py-1 text-right font-medium text-green-700">
                            {tx.deposit.toLocaleString()}원
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-green-50 font-bold">
                        <td colSpan={2} className="border border-gray-200 px-2 py-1 text-right">합계</td>
                        <td className="border border-gray-200 px-2 py-1 text-right text-green-700">
                          {detail.payments.reduce((s, t) => s + t.deposit, 0).toLocaleString()}원
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
