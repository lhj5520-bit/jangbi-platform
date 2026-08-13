'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import BankUploadModal from './UploadModal'
import PageHeader from '@/components/PageHeader'

interface BankTx {
  id: string
  transaction_at: string
  withdrawal: number | null
  deposit: number | null
  balance: number | null
  transaction_type: string | null
  counterparty: string | null
  branch: string | null
  memo: string | null
  matched_invoice_id: string | null
  matched_purchase_id: string | null
  matched_extra_ids: string | null
}

interface Invoice {
  id: string
  issue_date: string
  total_amount: number
  client_name?: string
  supplier_name?: string
  representative?: string
}

export default function BankPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'list' | 'match'>('list')
  const [matchTab, setMatchTab] = useState<'matched' | 'undeposit' | 'unwithdraw' | 'uninvoice' | 'unpurchase'>('matched')
  const [matchSearch, setMatchSearch] = useState('')
  const [txs, setTxs] = useState<BankTx[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [purchases, setPurchases] = useState<Invoice[]>([])
  const [supplierCeoMap, setSupplierCeoMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [matchMsg, setMatchMsg] = useState('')
  const [deleteRangeOpen, setDeleteRangeOpen] = useState(false)
  const [deleteFrom, setDeleteFrom] = useState('')
  const [deleteTo, setDeleteTo] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [manualMatchTx, setManualMatchTx] = useState<BankTx | null>(null)
  const [manualSearch, setManualSearch] = useState('')
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [selectedInvIds, setSelectedInvIds] = useState<Set<string>>(new Set())
  const [forceInvIds, setForceInvIds] = useState<Set<string>>(new Set())
  const [forcePurIds, setForcePurIds] = useState<Set<string>>(new Set())
  const [forceDepIds, setForceDepIds] = useState<Set<string>>(new Set())
  const [forceWithIds, setForceWithIds] = useState<Set<string>>(new Set())

  const EXPENSE_RULES: { pattern: RegExp; category: string }[] = [
    { pattern: /카드대금|기업카드|법인카드/i,          category: '카드대금' },
    { pattern: /세무서|소득세|부가가치세|법인세|지방소득세|세금/i, category: '세금' },
    { pattern: /세무사|세무법인|회계사/i,             category: '세무비용' },
    { pattern: /수수료|UMS/i,                        category: '기타수수료' },
    { pattern: /이자|캐피탈|캐피|금융|리스/i,          category: '대출이자' },
    { pattern: /주유|주유소|가스|LPG|오일/i,           category: '주유비' },
    { pattern: /급여|월급|임금|인건비/i,               category: '급여' },
  ]

  async function handleReclassifyExpenses() {
    if (!confirm('통장 출금내역을 기준으로 관리비를 재분류합니다.\n기존 자동분류 항목은 삭제 후 새로 생성됩니다. 계속하시겠습니까?')) return
    setMatchMsg('관리비 재분류 중...')

    // 기존 자동분류 항목 삭제 (memo가 거래처명과 같은 것 = 자동분류로 간주)
    const counterparties = txs
      .filter(t => t.withdrawal && t.withdrawal > 0 && t.counterparty)
      .map(t => t.counterparty!)
    if (counterparties.length > 0) {
      await supabase.from('expenses').delete().in('memo', counterparties)
    }

    // 재분류
    const expenses = txs
      .filter(tx => tx.withdrawal && tx.withdrawal > 0)
      .map(tx => {
        const name = tx.counterparty ?? ''
        const rule = EXPENSE_RULES.find(r => r.pattern.test(name))
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
    setMatchMsg(`관리비 재분류 완료: ${expenses.length}건`)
    load()
  }

  async function load() {
    setLoading(true)
    const [{ data: txData }, { data: invData }, { data: purData }, { data: supData }] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_at', { ascending: false }),
      supabase.from('invoices').select('id, issue_date, total_amount, client_name, representative, status').order('issue_date', { ascending: false }),
      supabase.from('purchase_invoices').select('id, issue_date, total_amount, supplier_name, representative, status').order('issue_date', { ascending: false }),
      supabase.from('suppliers').select('name, ceo_name'),
    ])
    setTxs((txData ?? []) as BankTx[])
    setInvoices((invData ?? []) as Invoice[])
    setPurchases((purData ?? []) as Invoice[])
    // 업체명 → 대표자명 매핑
    const ceoMap: Record<string, string> = {}
    ;(supData ?? []).forEach((s: any) => { if (s.name && s.ceo_name) ceoMap[s.name] = s.ceo_name })
    setSupplierCeoMap(ceoMap)
    setLoading(false)
  }

  async function handleAutoMatch() {
    setMatchMsg('매칭 중...')
    // 최신 데이터 다시 로드 (stale closure 방지 - 인보이스도 직접 fetch)
    const [{ data: freshTxs }, { data: freshInvData }, { data: freshPurData }, { data: freshSupData }] = await Promise.all([
      supabase.from('bank_transactions').select('*'),
      supabase.from('invoices').select('id, issue_date, total_amount, client_name, representative, status'),
      supabase.from('purchase_invoices').select('id, issue_date, total_amount, supplier_name, representative, status'),
      supabase.from('suppliers').select('name, ceo_name'),
    ])
    const allTxs = (freshTxs ?? []) as BankTx[]
    const freshInvoices = (freshInvData ?? []) as Invoice[]
    const freshPurchases = (freshPurData ?? []) as Invoice[]
    const freshCeoMap: Record<string, string> = {}
    ;(freshSupData ?? []).forEach((s: any) => { if (s.name && s.ceo_name) freshCeoMap[s.name] = s.ceo_name })

    const MATCH_DAYS = 180 // 거래일 기준 ±180일 이내

    function dayDiff(txDate: string, invDate: string) {
      const tx = new Date(txDate.replace(/\//g, '-').slice(0, 10))
      const inv = new Date(invDate.slice(0, 10))
      return Math.abs((tx.getTime() - inv.getTime()) / (1000 * 60 * 60 * 24))
    }

    // 업체명 유사도: (주)·㈜·주식회사는 통째로 제거, 개별 글자는 건드리지 않음
    const normalize = (s: string) =>
      s.replace(/\(주\)|\(유\)|㈜|주식회사|유한회사|\s|\(|\)/g, '').toLowerCase()

    function nameMatch(txName: string, invName: string) {
      const b = normalize(invName)
      // 거래처명이 "A-B" 형식이면 각 파트를 분리해서 매칭
      const txParts = txName.split('-').map(p => normalize(p.trim())).filter(Boolean)
      for (const a of txParts) {
        if (a.includes(b) || b.includes(a)) return true
        // 대표자명으로도 비교
        const ceo = freshCeoMap[invName] ?? ''
        if (ceo) {
          const c = normalize(ceo)
          if (a.includes(c) || c.includes(a)) return true
        }
      }
      return false
    }

    const updates: Array<{ id: string; matched_invoice_id?: string; matched_purchase_id?: string }> = []

    const AMOUNT_TOLERANCE = 1000 // 송금수수료 등 ±1000원 허용

    // 날짜순 정렬 (가까운 날짜 우선 처리, null 안전)
    const sortedTxs = [...allTxs].sort((a, b) =>
      (a.transaction_at ?? '').localeCompare(b.transaction_at ?? '')
    )

    for (const tx of sortedTxs) {
      if (tx.matched_invoice_id || tx.matched_purchase_id) continue
      const txName = tx.counterparty ?? ''

      if (tx.deposit) {
        // 조건에 맞는 후보 전체 찾기 → 날짜 가장 가까운 것 선택
        const candidates = freshInvoices
          .filter(i =>
            Math.abs(Number(i.total_amount ?? 0) - Number(tx.deposit ?? 0)) <= AMOUNT_TOLERANCE &&
            dayDiff(tx.transaction_at, i.issue_date) <= MATCH_DAYS &&
            (nameMatch(txName, i.client_name ?? '') || (i.representative ? nameMatch(txName, i.representative) : false))
          )
          .sort((a, b) => dayDiff(tx.transaction_at, a.issue_date) - dayDiff(tx.transaction_at, b.issue_date))
        const match = candidates[0]
        if (match) updates.push({ id: tx.id, matched_invoice_id: match.id })
      } else if (tx.withdrawal) {
        const candidates = freshPurchases
          .filter(p =>
            Math.abs(Number(p.total_amount ?? 0) - Number(tx.withdrawal ?? 0)) <= AMOUNT_TOLERANCE &&
            dayDiff(tx.transaction_at, p.issue_date) <= MATCH_DAYS &&
            (nameMatch(txName, p.supplier_name ?? '') || (p.representative ? nameMatch(txName, p.representative) : false))
          )
          .sort((a, b) => dayDiff(tx.transaction_at, a.issue_date) - dayDiff(tx.transaction_at, b.issue_date))
        const match = candidates[0]
        if (match) updates.push({ id: tx.id, matched_purchase_id: match.id })
      }
    }

    let matched = 0
    for (const u of updates) {
      const { id, ...rest } = u
      await supabase.from('bank_transactions').update(rest).eq('id', id)
      matched++
    }
    setMatchMsg(`자동 매칭 완료: ${matched}건 연결됨`)
    load()
  }

  async function handleForceMatchInvoices() {
    if (forceInvIds.size === 0) return
    if (!confirm(`선택한 매출계산서 ${forceInvIds.size}건을 강제 수금완료 처리하시겠습니까?`)) return
    await Promise.all([...forceInvIds].map(id =>
      supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
    ))
    setForceInvIds(new Set()); load()
  }

  async function handleForceMatchPurchases() {
    if (forcePurIds.size === 0) return
    if (!confirm(`선택한 매입계산서 ${forcePurIds.size}건을 강제 지급완료 처리하시겠습니까?`)) return
    await Promise.all([...forcePurIds].map(id =>
      supabase.from('purchase_invoices').update({ status: 'paid' }).eq('id', id)
    ))
    setForcePurIds(new Set()); load()
  }

  async function handleForceDeposits() {
    if (forceDepIds.size === 0) return
    if (!confirm(`선택한 입금 미매칭 ${forceDepIds.size}건을 강제 처리하시겠습니까?`)) return
    await Promise.all([...forceDepIds].map(id =>
      supabase.from('bank_transactions').update({ matched_extra_ids: 'forced' }).eq('id', id)
    ))
    setForceDepIds(new Set()); load()
  }

  async function handleForceWithdrawals() {
    if (forceWithIds.size === 0) return
    if (!confirm(`선택한 출금 미매칭 ${forceWithIds.size}건을 강제 처리하시겠습니까?`)) return
    await Promise.all([...forceWithIds].map(id =>
      supabase.from('bank_transactions').update({ matched_extra_ids: 'forced' }).eq('id', id)
    ))
    setForceWithIds(new Set()); load()
  }

  async function handleDelete(txId: string) {
    if (!confirm('이 거래내역을 삭제하시겠습니까?')) return
    await supabase.from('bank_transactions').delete().eq('id', txId)
    load()
  }

  async function handleUnmatch(txId: string) {
    await supabase.from('bank_transactions').update({ matched_invoice_id: null, matched_purchase_id: null }).eq('id', txId)
    load()
  }

  async function handleDeleteRange() {
    if (!deleteFrom || !deleteTo) { alert('시작일과 종료일을 입력하세요.'); return }
    // transaction_at은 "2026/05/15 14:30:00" 형태로 저장되므로 슬래시 형태로 변환
    const fromSlash = deleteFrom.replace(/-/g, '/')
    const toSlash = deleteTo.replace(/-/g, '/') + ' 99:99:99'
    const count = txs.filter(t => t.transaction_at >= fromSlash && t.transaction_at <= toSlash).length
    if (!confirm(`${deleteFrom} ~ ${deleteTo} 기간 거래내역 ${count}건을 삭제하시겠습니까?`)) return
    setDeleting(true)
    await supabase.from('bank_transactions')
      .delete()
      .gte('transaction_at', fromSlash)
      .lte('transaction_at', toSlash)
    setDeleting(false)
    setDeleteRangeOpen(false)
    setDeleteFrom('')
    setDeleteTo('')
    load()
  }

  async function handleManualMatch(tx: BankTx, invId: string, type: 'invoice' | 'purchase') {
    if (type === 'invoice') {
      await supabase.from('bank_transactions').update({ matched_invoice_id: invId }).eq('id', tx.id)
    } else {
      await supabase.from('bank_transactions').update({ matched_purchase_id: invId }).eq('id', tx.id)
    }
    setManualMatchTx(null)
    setManualSearch('')
    load()
  }

  async function handleMultiMatch(tx: BankTx, type: 'invoice' | 'purchase') {
    if (selectedInvIds.size === 0) return
    const ids = [...selectedInvIds]
    const update: any = type === 'invoice'
      ? { matched_invoice_id: ids[0] }
      : { matched_purchase_id: ids[0] }
    if (ids.length > 1) {
      update.matched_extra_ids = JSON.stringify(ids.slice(1).map(id => ({ type, id })))
    } else {
      update.matched_extra_ids = null
    }
    await supabase.from('bank_transactions').update(update).eq('id', tx.id)
    setManualMatchTx(null)
    setManualSearch('')
    setMultiSelectMode(false)
    setSelectedInvIds(new Set())
    load()
  }

  async function handleDeleteAll() {
    if (!confirm('모든 통장 거래내역을 삭제하시겠습니까?')) return
    await supabase.from('bank_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    load()
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => txs.filter(tx => {
    if (typeFilter === 'deposit' && !tx.deposit) return false
    if (typeFilter === 'withdrawal' && !tx.withdrawal) return false
    if (search) {
      const q = search.toLowerCase()
      if (!tx.counterparty?.toLowerCase().includes(q) && !tx.transaction_type?.toLowerCase().includes(q)) return false
    }
    if (dateFrom && tx.transaction_at < dateFrom) return false
    if (dateTo && tx.transaction_at > dateTo + ' 99:99:99') return false
    return true
  }), [txs, typeFilter, search, dateFrom, dateTo])

  const totalDeposit = filtered.reduce((s, t) => s + (t.deposit ?? 0), 0)
  const totalWithdrawal = filtered.reduce((s, t) => s + (t.withdrawal ?? 0), 0)

  const invById = useMemo(() => {
    const m: Record<string, Invoice> = {}
    invoices.forEach(i => { m[i.id] = i })
    return m
  }, [invoices])
  const purById = useMemo(() => {
    const m: Record<string, Invoice> = {}
    purchases.forEach(p => { m[p.id] = p })
    return m
  }, [purchases])

  const matchedTxs = txs.filter(t => t.matched_invoice_id || t.matched_purchase_id)
  const unmatchedDeposits = txs.filter(t => t.deposit && !t.matched_invoice_id && t.matched_extra_ids !== 'forced')
  const unmatchedWithdrawals = txs.filter(t => t.withdrawal && !t.matched_purchase_id && t.matched_extra_ids !== 'forced')

  // 계산서 중 통장내역과 매칭 안 된 것
  const matchedInvIds = new Set(txs.map(t => t.matched_invoice_id).filter(Boolean))
  const matchedPurIds = new Set(txs.map(t => t.matched_purchase_id).filter(Boolean))
  const unmatchedInvoices = invoices.filter(i => !matchedInvIds.has(i.id) && (i as any).status !== 'paid')
  const unmatchedPurchases = purchases.filter(p => !matchedPurIds.has(p.id) && (p as any).status !== 'paid')

  const mq = matchSearch.toLowerCase()
  const filteredMatchedTxs = matchSearch ? matchedTxs.filter(t => t.counterparty?.toLowerCase().includes(mq)) : matchedTxs
  const filteredUndeposits = matchSearch ? unmatchedDeposits.filter(t => t.counterparty?.toLowerCase().includes(mq)) : unmatchedDeposits
  const filteredUnwithdraws = matchSearch ? unmatchedWithdrawals.filter(t => t.counterparty?.toLowerCase().includes(mq)) : unmatchedWithdrawals
  const filteredUninvoices = matchSearch ? unmatchedInvoices.filter(i => i.client_name?.toLowerCase().includes(mq)) : unmatchedInvoices
  const filteredUnpurchases = matchSearch ? unmatchedPurchases.filter(p => p.supplier_name?.toLowerCase().includes(mq)) : unmatchedPurchases

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="통장내역"
        primary={{ label: '내역 업로드', onClick: () => setUploadOpen(true) }}
        secondary={[
          ...(tab === 'match' ? [
            { label: '자동 매칭', onClick: handleAutoMatch },
            { label: '관리비 재분류', onClick: handleReclassifyExpenses },
          ] : []),
          ...(txs.length > 0 ? [{ label: '기간삭제', onClick: () => setDeleteRangeOpen(true) }] : []),
        ]}
      />

      {matchMsg && (
        <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{matchMsg}</div>
      )}

      {/* 탭 */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1 md:w-fit">
        {(['list', 'match'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-5 py-2.5 text-sm font-medium transition-colors md:flex-none ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'list' ? '입출금 내역' : '정산 대조'}
          </button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* 필터 */}
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-sm">~</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <input type="text" placeholder="거래처 검색..." value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[120px] px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
              {([['all', '전체'], ['deposit', '입금'], ['withdrawal', '출금']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setTypeFilter(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    typeFilter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          {/* 요약 카드 */}
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-600 mb-1">총 입금</p>
                <p className="text-base font-bold text-blue-700">{totalDeposit.toLocaleString()}원</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs text-red-600 mb-1">총 출금</p>
                <p className="text-base font-bold text-red-700">{totalWithdrawal.toLocaleString()}원</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">건수</p>
                <p className="text-base font-bold text-gray-900">{filtered.length}건</p>
              </div>
            </div>
          )}

          {/* 모바일 카드 */}
          <div className="touch-list md:hidden space-y-2">
            {loading ? (
              <div className="text-center py-8 text-gray-400">불러오는 중...</div>
            ) : txs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">💳</div>
                <p>XLS 업로드로 거래내역을 가져오세요</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-400">검색 결과가 없습니다</div>
            ) : filtered.map(tx => (
              <div key={tx.id} className="bg-white rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-2">
                    <input
                      type="text"
                      defaultValue={tx.counterparty ?? ''}
                      onBlur={async e => {
                        const val = e.target.value.trim() || null
                        if (val === (tx.counterparty ?? null)) return
                        await supabase.from('bank_transactions').update({ counterparty: val }).eq('id', tx.id)
                        setTxs(prev => prev.map(t => t.id === tx.id ? { ...t, counterparty: val } : t))
                      }}
                      className="w-full font-medium text-gray-900 text-sm border border-transparent rounded px-1 hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent focus:bg-white"
                    />
                    <div className="text-xs text-gray-400 mt-0.5 px-1">{tx.transaction_at?.slice(0, 10)} · {tx.transaction_type ?? ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      {tx.deposit ? (
                        <div className="text-blue-600 font-bold">+{tx.deposit.toLocaleString()}원</div>
                      ) : (
                        <div className="text-red-500 font-bold">-{tx.withdrawal?.toLocaleString()}원</div>
                      )}
                      <div className="text-xs text-gray-400">{tx.balance?.toLocaleString()}원</div>
                    </div>
                    <button onClick={() => handleDelete(tx.id)}
                      className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded border border-red-100 hover:border-red-300">
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 데스크탑 테이블 */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">거래일시</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">거래처</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">내용</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">출금</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">입금</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">잔액</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-600">비고</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
                ) : txs.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    <div className="text-4xl mb-2">💳</div>
                    <p>XLS 업로드로 통장 거래내역을 가져오세요</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-gray-400">검색 결과가 없습니다</td></tr>
                ) : filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-500 text-xs">{tx.transaction_at?.replace('T', ' ').slice(0, 19)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      <input
                        type="text"
                        defaultValue={tx.counterparty ?? ''}
                        onBlur={async e => {
                          const val = e.target.value.trim() || null
                          if (val === (tx.counterparty ?? null)) return
                          await supabase.from('bank_transactions').update({ counterparty: val }).eq('id', tx.id)
                          setTxs(prev => prev.map(t => t.id === tx.id ? { ...t, counterparty: val } : t))
                        }}
                        className="w-full px-2 py-1 text-sm font-medium text-gray-900 border border-transparent rounded hover:border-gray-300 focus:border-blue-400 focus:outline-none bg-transparent focus:bg-white"
                      />
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{tx.transaction_type ?? '-'}</td>
                    <td className="px-5 py-3 text-right text-red-500 font-medium">
                      {tx.withdrawal ? tx.withdrawal.toLocaleString() : '-'}
                    </td>
                    <td className="px-5 py-3 text-right text-blue-600 font-medium">
                      {tx.deposit ? tx.deposit.toLocaleString() : '-'}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500">{tx.balance?.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        defaultValue={tx.memo ?? ''}
                        placeholder="비고 입력"
                        onBlur={async e => {
                          const val = e.target.value.trim() || null
                          if (val === (tx.memo ?? null)) return
                          await supabase.from('bank_transactions').update({ memo: val }).eq('id', tx.id)
                          setTxs(prev => prev.map(t => t.id === tx.id ? { ...t, memo: val } : t))
                        }}
                        className="w-40 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400 text-gray-600 placeholder-gray-300"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => handleDelete(tx.id)}
                        className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded border border-red-100 hover:border-red-300">
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'match' && (
        <div>
          {/* 서브탭 */}
          <div className="flex gap-1 flex-wrap mb-5">
            {([
              ['uninvoice',  `📄 매출미수금 ${unmatchedInvoices.length}`],
              ['unpurchase', `📦 매입미지급 ${unmatchedPurchases.length}`],
              ['matched',    `✅ 매칭완료 ${matchedTxs.length}`],
              ['undeposit',  `🔵 입금미매칭 ${unmatchedDeposits.length}`],
              ['unwithdraw', `🔴 출금미매칭 ${unmatchedWithdrawals.length}`],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setMatchTab(key); setMatchSearch('') }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  matchTab === key ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {/* 업체명 검색 */}
          <div className="mb-4">
            <input type="text" value={matchSearch} onChange={e => setMatchSearch(e.target.value)}
              placeholder="업체명 검색..."
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        <div className="space-y-6">
          {matchTab === 'matched' && <div>
            <h2 className="text-base font-semibold text-gray-700 mb-3">
              ✅ 매칭 완료 <span className="text-green-600 font-bold">{filteredMatchedTxs.length}건</span>
            </h2>
            {filteredMatchedTxs.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">아직 매칭된 거래가 없습니다. 자동 매칭을 눌러보세요.</div>
            ) : (
              <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-200 md:overflow-hidden">
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">거래일시</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">거래처</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600">금액</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">비고</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">연결된 계산서</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredMatchedTxs.map(tx => {
                        const inv = tx.matched_invoice_id ? invById[tx.matched_invoice_id] : null
                        const pur = tx.matched_purchase_id ? purById[tx.matched_purchase_id] : null
                        const linked = inv ?? pur
                        const isInv = !!inv
                        return (
                          <tr key={tx.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-xs text-gray-500">{tx.transaction_at?.slice(0, 10)}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{tx.counterparty}</td>
                            <td className={`px-4 py-3 text-right font-medium ${isInv ? 'text-blue-600' : 'text-red-500'}`}>
                              {isInv ? `+${tx.deposit?.toLocaleString()}` : `-${tx.withdrawal?.toLocaleString()}`}원
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px] truncate">{tx.memo ?? '-'}</td>
                            <td className="px-4 py-3 text-xs">
                              {linked && (
                                <span className={`px-2 py-0.5 rounded-full ${isInv ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                  {isInv ? '매출' : '매입'} {linked.issue_date} · {linked.total_amount?.toLocaleString()}원
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleUnmatch(tx.id)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">해제</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="touch-list md:hidden space-y-2">
                  {filteredMatchedTxs.map(tx => {
                    const inv = tx.matched_invoice_id ? invById[tx.matched_invoice_id] : null
                    const isInv = !!inv
                    return (
                      <div key={tx.id} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-sm">{tx.counterparty}</div>
                          <div className="text-xs text-gray-400">{tx.transaction_at?.slice(0, 10)}</div>
                          {tx.memo && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{tx.memo}</div>}
                          <div className={`text-sm font-bold mt-0.5 ${isInv ? 'text-blue-600' : 'text-red-500'}`}>
                            {isInv ? `+${tx.deposit?.toLocaleString()}` : `-${tx.withdrawal?.toLocaleString()}`}원
                          </div>
                        </div>
                        <button onClick={() => handleUnmatch(tx.id)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">해제</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>}

          {matchTab === 'undeposit' && <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-700">
                🔵 입금 미매칭 <span className="text-blue-600 font-bold">{filteredUndeposits.length}건</span>
              </h2>
              {forceDepIds.size > 0 && (
                <button onClick={handleForceDeposits}
                  className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                  ✅ 강제 처리 ({forceDepIds.size}건)
                </button>
              )}
            </div>
            <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-200 md:overflow-hidden">
              <div className="touch-list md:hidden space-y-2">
                {filteredUndeposits.map(tx => (
                  <div key={tx.id} onClick={() => setForceDepIds(s => { const n = new Set(s); s.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n })}
                    className={`bg-white rounded-xl border p-3 flex items-center gap-3 cursor-pointer ${forceDepIds.has(tx.id) ? 'border-blue-400 bg-blue-50' : 'border-blue-100'}`}>
                    <input type="checkbox" readOnly checked={forceDepIds.has(tx.id)} className="w-4 h-4 accent-blue-600" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{tx.counterparty}</div>
                      <div className="text-xs text-gray-400">{tx.transaction_at?.slice(0, 10)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-blue-600 font-bold">+{tx.deposit?.toLocaleString()}원</div>
                      <button onClick={e => { e.stopPropagation(); setManualMatchTx(tx); setManualSearch(tx.counterparty ?? '') }}
                        className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-600 hover:bg-blue-200">매칭</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" className="accent-blue-600"
                        checked={forceDepIds.size === filteredUndeposits.length && filteredUndeposits.length > 0}
                        onChange={e => setForceDepIds(e.target.checked ? new Set(filteredUndeposits.map(t => t.id)) : new Set())} />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">거래일시</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">거래처</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">입금액</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">비고</th>
                    <th className="px-4 py-3"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUndeposits.map(tx => (
                      <tr key={tx.id} onClick={() => setForceDepIds(s => { const n = new Set(s); s.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n })}
                        className={`cursor-pointer ${forceDepIds.has(tx.id) ? 'bg-blue-50' : 'hover:bg-blue-50'}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" readOnly checked={forceDepIds.has(tx.id)} className="w-4 h-4 accent-blue-600" />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{tx.transaction_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{tx.counterparty}</td>
                        <td className="px-4 py-3 text-right text-blue-600 font-medium">{tx.deposit?.toLocaleString()}원</td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px] truncate">{tx.memo ?? '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={e => { e.stopPropagation(); setManualMatchTx(tx); setManualSearch(tx.counterparty ?? '') }}
                            className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-600 hover:bg-blue-200">매칭</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>}

          {matchTab === 'unwithdraw' && <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-700">
                🔴 출금 미매칭 <span className="text-red-500 font-bold">{filteredUnwithdraws.length}건</span>
              </h2>
              {forceWithIds.size > 0 && (
                <button onClick={handleForceWithdrawals}
                  className="text-sm px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                  ✅ 강제 처리 ({forceWithIds.size}건)
                </button>
              )}
            </div>
            <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-200 md:overflow-hidden">
              <div className="touch-list md:hidden space-y-2">
                {filteredUnwithdraws.map(tx => (
                  <div key={tx.id} onClick={() => setForceWithIds(s => { const n = new Set(s); s.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n })}
                    className={`bg-white rounded-xl border p-3 flex items-center gap-3 cursor-pointer ${forceWithIds.has(tx.id) ? 'border-red-400 bg-red-50' : 'border-red-100'}`}>
                    <input type="checkbox" readOnly checked={forceWithIds.has(tx.id)} className="w-4 h-4 accent-red-600" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{tx.counterparty}</div>
                      <div className="text-xs text-gray-400">{tx.transaction_at?.slice(0, 10)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-red-500 font-bold">-{tx.withdrawal?.toLocaleString()}원</div>
                      <button onClick={e => { e.stopPropagation(); setManualMatchTx(tx); setManualSearch(tx.counterparty ?? '') }}
                        className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">매칭</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox" className="accent-red-600"
                        checked={forceWithIds.size === filteredUnwithdraws.length && filteredUnwithdraws.length > 0}
                        onChange={e => setForceWithIds(e.target.checked ? new Set(filteredUnwithdraws.map(t => t.id)) : new Set())} />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">거래일시</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">거래처</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">출금액</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">비고</th>
                    <th className="px-4 py-3"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUnwithdraws.map(tx => (
                      <tr key={tx.id} onClick={() => setForceWithIds(s => { const n = new Set(s); s.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n })}
                        className={`cursor-pointer ${forceWithIds.has(tx.id) ? 'bg-red-50' : 'hover:bg-red-50'}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" readOnly checked={forceWithIds.has(tx.id)} className="w-4 h-4 accent-red-600" />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{tx.transaction_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{tx.counterparty}</td>
                        <td className="px-4 py-3 text-right text-red-500 font-medium">{tx.withdrawal?.toLocaleString()}원</td>
                        <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px] truncate">{tx.memo ?? '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={e => { e.stopPropagation(); setManualMatchTx(tx); setManualSearch(tx.counterparty ?? '') }}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">매칭</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>}

          {matchTab === 'uninvoice' && <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-700">
                📄 매출계산서 미수금 <span className="text-blue-600 font-bold">{filteredUninvoices.length}건</span>
              </h2>
              {forceInvIds.size > 0 && (
                <button onClick={handleForceMatchInvoices}
                  className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                  ✅ 강제 수금완료 ({forceInvIds.size}건)
                </button>
              )}
            </div>
            {filteredUninvoices.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-400 text-sm">모든 매출계산서가 매칭됐습니다</div>
            ) : (
              <div className="md:bg-white md:rounded-xl md:border md:border-gray-200 md:overflow-hidden">
                <div className="touch-list md:hidden space-y-2">
                  {filteredUninvoices.map(inv => (
                    <div key={inv.id} onClick={() => setForceInvIds(s => { const n = new Set(s); s.has(inv.id) ? n.delete(inv.id) : n.add(inv.id); return n })}
                      className={`bg-white rounded-xl border p-3 flex items-center gap-3 cursor-pointer ${forceInvIds.has(inv.id) ? 'border-blue-400 bg-blue-50' : 'border-blue-100'}`}>
                      <input type="checkbox" readOnly checked={forceInvIds.has(inv.id)} className="w-4 h-4 accent-blue-600" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{inv.client_name ?? '-'}</div>
                        <div className="text-xs text-gray-400">{inv.issue_date}</div>
                      </div>
                      <div className="text-blue-600 font-bold">{inv.total_amount?.toLocaleString()}원</div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" className="accent-blue-600"
                          checked={filteredUninvoices.length > 0 && filteredUninvoices.every(i => forceInvIds.has(i.id))}
                          onChange={e => setForceInvIds(e.target.checked ? new Set(filteredUninvoices.map(i => i.id)) : new Set())} />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">발행일</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">거래처</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">금액</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredUninvoices.map(inv => (
                        <tr key={inv.id} onClick={() => setForceInvIds(s => { const n = new Set(s); s.has(inv.id) ? n.delete(inv.id) : n.add(inv.id); return n })}
                          className={`cursor-pointer ${forceInvIds.has(inv.id) ? 'bg-blue-50' : 'hover:bg-blue-50'}`}>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="accent-blue-600" checked={forceInvIds.has(inv.id)}
                              onChange={() => setForceInvIds(s => { const n = new Set(s); s.has(inv.id) ? n.delete(inv.id) : n.add(inv.id); return n })} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{inv.issue_date}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{inv.client_name ?? '-'}{(inv as any).representative && <span className="ml-1.5 text-xs text-gray-400">({(inv as any).representative})</span>}</td>
                          <td className="px-4 py-3 text-right text-blue-600 font-medium">{inv.total_amount?.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>}

          {matchTab === 'unpurchase' && <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-700">
                📦 매입계산서 미지급 <span className="text-orange-500 font-bold">{filteredUnpurchases.length}건</span>
              </h2>
              {forcePurIds.size > 0 && (
                <button onClick={handleForceMatchPurchases}
                  className="text-sm px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">
                  ✅ 강제 지급완료 ({forcePurIds.size}건)
                </button>
              )}
            </div>
            {filteredUnpurchases.length === 0 ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-400 text-sm">모든 매입계산서가 매칭됐습니다</div>
            ) : (
              <div className="md:bg-white md:rounded-xl md:border md:border-gray-200 md:overflow-hidden">
                <div className="touch-list md:hidden space-y-2">
                  {filteredUnpurchases.map(pur => (
                    <div key={pur.id} onClick={() => setForcePurIds(s => { const n = new Set(s); s.has(pur.id) ? n.delete(pur.id) : n.add(pur.id); return n })}
                      className={`bg-white rounded-xl border p-3 flex items-center gap-3 cursor-pointer ${forcePurIds.has(pur.id) ? 'border-orange-400 bg-orange-50' : 'border-orange-100'}`}>
                      <input type="checkbox" readOnly checked={forcePurIds.has(pur.id)} className="w-4 h-4 accent-orange-500" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{pur.supplier_name ?? '-'}{pur.representative && <span className="ml-1.5 text-xs text-gray-400">({pur.representative})</span>}</div>
                        <div className="text-xs text-gray-400">{pur.issue_date}</div>
                      </div>
                      <div className="text-orange-500 font-bold">{pur.total_amount?.toLocaleString()}원</div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 w-8">
                        <input type="checkbox" className="accent-orange-500"
                          checked={filteredUnpurchases.length > 0 && filteredUnpurchases.every(p => forcePurIds.has(p.id))}
                          onChange={e => setForcePurIds(e.target.checked ? new Set(filteredUnpurchases.map(p => p.id)) : new Set())} />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">발행일</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">거래처</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">금액</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredUnpurchases.map(pur => (
                        <tr key={pur.id} onClick={() => setForcePurIds(s => { const n = new Set(s); s.has(pur.id) ? n.delete(pur.id) : n.add(pur.id); return n })}
                          className={`cursor-pointer ${forcePurIds.has(pur.id) ? 'bg-orange-50' : 'hover:bg-orange-50'}`}>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <input type="checkbox" className="accent-orange-500" checked={forcePurIds.has(pur.id)}
                              onChange={() => setForcePurIds(s => { const n = new Set(s); s.has(pur.id) ? n.delete(pur.id) : n.add(pur.id); return n })} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{pur.issue_date}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{pur.supplier_name ?? '-'}{pur.representative && <span className="ml-1.5 text-xs text-gray-400">({pur.representative})</span>}</td>
                          <td className="px-4 py-3 text-right text-orange-500 font-medium">{pur.total_amount?.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>}
        </div>
        </div>
      )}

      {/* 수동 매칭 모달 */}
      {manualMatchTx && (() => {
        const isDeposit = !!manualMatchTx.deposit
        const list = isDeposit ? invoices : purchases
        // (주) 주식회사 등 법인 접두어 제거 후 비교
        function normCo(s: string) {
          return s.replace(/\(주\)|㈜|주식회사|유한회사|\(유\)|\(합\)|협동조합/g, '').replace(/\s+/g, '').toLowerCase()
        }
        const mq2 = manualSearch.toLowerCase()
        const mq2norm = normCo(manualSearch)
        // "-" "/" 공백 등으로 쪼개서 각 단어 중 하나라도 매칭되면 표시
        const tokens = mq2 ? mq2.split(/[-\/\s·]+/).map(t => t.trim()).filter(t => t.length > 1) : []
        const filtered2 = list.filter(i => {
          const rawName = (i.client_name ?? i.supplier_name ?? '')
          const name = rawName.toLowerCase()
          const nameNorm = normCo(rawName)
          const rep = (i.representative ?? '').toLowerCase()
          if (!mq2) return true
          // 전체 검색어 포함 OR 정규화 비교 OR 분리된 단어 중 하나라도 포함
          // (단, 정규화 후 빈 문자열 토큰은 스킵 — "주식회사" → "" → 모든 업체 매칭 방지)
          return name.includes(mq2) || rep.includes(mq2) ||
            (mq2norm.length >= 2 && nameNorm.includes(mq2norm)) ||
            (nameNorm.length >= 2 && mq2norm.length >= 2 && mq2norm.includes(nameNorm)) ||
            tokens.some(tok => {
              const tokNorm = normCo(tok)
              if (!tokNorm) return false  // "주식회사" 등 → 빈 문자열 → 스킵
              return name.includes(tok) || rep.includes(tok) || nameNorm.includes(tokNorm)
            })
        })
        // 이미 다른 은행거래에 매칭된 계산서 ID 세트
        const alreadyMatchedIds = new Set(
          txs
            .filter(t => t.id !== manualMatchTx.id)
            .map(t => isDeposit ? t.matched_invoice_id : t.matched_purchase_id)
            .filter(Boolean) as string[]
        )
        const selectedTotal = filtered2
          .filter(i => selectedInvIds.has(i.id))
          .reduce((s, i) => s + (i.total_amount ?? 0), 0)
        const txAmount = isDeposit ? (manualMatchTx.deposit ?? 0) : (manualMatchTx.withdrawal ?? 0)
        const diff = txAmount - selectedTotal
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
                <div>
                  <h2 className="font-bold text-gray-900">수동 매칭</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {manualMatchTx.counterparty} · {manualMatchTx.transaction_at?.slice(0, 10)} ·
                    <span className={isDeposit ? 'text-blue-600 font-medium' : 'text-red-500 font-medium'}>
                      {isDeposit ? ` +${manualMatchTx.deposit?.toLocaleString()}` : ` -${manualMatchTx.withdrawal?.toLocaleString()}`}원
                    </span>
                  </p>
                </div>
                <button onClick={() => { setManualMatchTx(null); setMultiSelectMode(false); setSelectedInvIds(new Set()) }}
                  className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="px-5 pt-4 shrink-0 space-y-2">
                <input value={manualSearch} onChange={e => setManualSearch(e.target.value)}
                  placeholder={isDeposit ? '매출계산서 검색...' : '매입계산서 검색...'}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {isDeposit ? '매출계산서' : '매입계산서'} {filtered2.length}건
                  </span>
                  <button onClick={() => setMultiSelectMode(m => !m)}
                    className={`text-xs px-2 py-1 rounded ${multiSelectMode ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                    {multiSelectMode ? '단건 모드' : '복수 선택'}
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-2 space-y-1.5">
                {filtered2.map(item => {
                  const isSelected = selectedInvIds.has(item.id)
                  const isAlreadyMatched = alreadyMatchedIds.has(item.id)
                  return (
                    <div key={item.id}
                      onClick={() => {
                        if (isAlreadyMatched && !isSelected) return
                        if (multiSelectMode) {
                          setSelectedInvIds(s => { const n = new Set(s); isSelected ? n.delete(item.id) : n.add(item.id); return n })
                        } else {
                          setSelectedInvIds(new Set([item.id]))
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors
                        ${isSelected ? (isDeposit ? 'bg-blue-50 border-blue-300' : 'bg-orange-50 border-orange-300') : 'border-gray-100 hover:border-gray-300'}
                        ${isAlreadyMatched && !isSelected ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {item.client_name ?? item.supplier_name ?? '-'}
                          {item.representative && <span className="ml-1 text-xs text-gray-400">({item.representative})</span>}
                        </div>
                        <div className="text-xs text-gray-400">{item.issue_date}{isAlreadyMatched ? ' · 이미 매칭됨' : ''}</div>
                      </div>
                      <div className={`text-sm font-bold ml-3 ${isDeposit ? 'text-blue-600' : 'text-orange-500'}`}>
                        {item.total_amount?.toLocaleString()}원
                      </div>
                    </div>
                  )
                })}
                {filtered2.length === 0 && (
                  <div className="text-center text-gray-400 text-sm py-6">검색 결과 없음</div>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 shrink-0 space-y-3">
                {selectedInvIds.size > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">선택 합계</span>
                    <span className="font-medium">{selectedTotal.toLocaleString()}원</span>
                  </div>
                )}
                {selectedInvIds.size > 0 && (
                  <div className={`flex justify-between text-sm ${Math.abs(diff) > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                    <span>차액</span>
                    <span className="font-medium">{diff > 0 ? '+' : ''}{diff.toLocaleString()}원</span>
                  </div>
                )}
                <button
                  disabled={selectedInvIds.size === 0}
                  onClick={async () => {
                    if (selectedInvIds.size === 0) return
                    const ids = [...selectedInvIds]
                    if (isDeposit) {
                      const primaryId = ids[0]
                      const extraIds = ids.slice(1).join(',')
                      await supabase.from('bank_transactions').update({
                        matched_invoice_id: primaryId,
                        matched_extra_ids: extraIds || null
                      }).eq('id', manualMatchTx.id)
                      await supabase.from('invoices').update({ status: 'paid' }).in('id', ids)
                    } else {
                      const primaryId = ids[0]
                      const extraIds = ids.slice(1).join(',')
                      await supabase.from('bank_transactions').update({
                        matched_purchase_id: primaryId,
                        matched_extra_ids: extraIds || null
                      }).eq('id', manualMatchTx.id)
                      await supabase.from('purchase_invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).in('id', ids)
                    }
                    setManualMatchTx(null); setMultiSelectMode(false); setSelectedInvIds(new Set()); load()
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  매칭 완료 {selectedInvIds.size > 0 ? `(${selectedInvIds.size}건)` : ''}
                </button>
              </div>
            </div>
          </div>
        )
      })()}
      {uploadOpen && (
        <BankUploadModal
          onClose={() => setUploadOpen(false)}
          onSaved={() => { setUploadOpen(false); load() }}
        />
      )}
    </div>
  )
}
