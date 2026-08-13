'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ExpensesExcelUploadModal from './ExpensesExcelUploadModal'
import PageHeader from '@/components/PageHeader'

interface Expense {
  id: string
  category: string
  amount: number
  expense_date: string
  memo: string | null
  note: string | null
  created_at: string
}

const DEFAULT_CATEGORIES = ['급여', '주유비', '수리비', '기타수수료', '대출이자', '세금', '카드대금', '세무비용', '차량유지비', '식대&집자재']

const CATEGORY_COLORS: Record<string, { badge: string; bar: string; card: string; hex: string }> = {
  '급여':       { badge: 'bg-indigo-100 text-indigo-700',  bar: 'bg-indigo-400',  card: 'bg-indigo-50 border-indigo-200',  hex: '#818cf8' },
  '주유비':     { badge: 'bg-sky-100 text-sky-700',        bar: 'bg-sky-400',     card: 'bg-sky-50 border-sky-200',        hex: '#38bdf8' },
  '수리비':     { badge: 'bg-teal-100 text-teal-700',      bar: 'bg-teal-400',    card: 'bg-teal-50 border-teal-200',      hex: '#2dd4bf' },
  '기타수수료': { badge: 'bg-violet-100 text-violet-700',  bar: 'bg-violet-400',  card: 'bg-violet-50 border-violet-200',  hex: '#a78bfa' },
  '대출이자':   { badge: 'bg-rose-100 text-rose-700',      bar: 'bg-rose-400',    card: 'bg-rose-50 border-rose-200',      hex: '#fb7185' },
  '세금':       { badge: 'bg-amber-100 text-amber-700',    bar: 'bg-amber-400',   card: 'bg-amber-50 border-amber-200',    hex: '#fbbf24' },
  '카드대금':   { badge: 'bg-orange-100 text-orange-700',  bar: 'bg-orange-400',  card: 'bg-orange-50 border-orange-200',  hex: '#fb923c' },
  '세무비용':   { badge: 'bg-emerald-100 text-emerald-700',bar: 'bg-emerald-400', card: 'bg-emerald-50 border-emerald-200',hex: '#34d399' },
  '차량유지비': { badge: 'bg-cyan-100 text-cyan-700',      bar: 'bg-cyan-400',    card: 'bg-cyan-50 border-cyan-200',      hex: '#22d3ee' },
  '식대&집자재':{ badge: 'bg-pink-100 text-pink-700',      bar: 'bg-pink-400',    card: 'bg-pink-50 border-pink-200',      hex: '#f472b6' },
}

const COLOR_POOL = [
  { badge: 'bg-teal-100 text-teal-700',   bar: 'bg-teal-500',   card: 'bg-teal-50 border-teal-200' },
  { badge: 'bg-pink-100 text-pink-700',   bar: 'bg-pink-500',   card: 'bg-pink-50 border-pink-200' },
  { badge: 'bg-cyan-100 text-cyan-700',   bar: 'bg-cyan-500',   card: 'bg-cyan-50 border-cyan-200' },
  { badge: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-500', card: 'bg-indigo-50 border-indigo-200' },
  { badge: 'bg-lime-100 text-lime-700',   bar: 'bg-lime-500',   card: 'bg-lime-50 border-lime-200' },
  { badge: 'bg-rose-100 text-rose-700',   bar: 'bg-rose-500',   card: 'bg-rose-50 border-rose-200' },
]

const _colorCache: Record<string, { badge: string; bar: string; card: string }> = {}
let _colorIdx = 0

function getColor(cat: string) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat]
  if (!_colorCache[cat]) {
    _colorCache[cat] = COLOR_POOL[_colorIdx % COLOR_POOL.length]
    _colorIdx++
  }
  return _colorCache[cat]
}

export default function ExpensesPage() {
  const supabase = createClient()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<string[]>([])
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [catFilter, setCatFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Expense | null>(null)
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [excelOpen, setExcelOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month')
  const [selYear, setSelYear] = useState(() => new Date().getFullYear().toString())
  const [yearData, setYearData] = useState<Record<string, number>>({})
  const [yearTotal, setYearTotal] = useState(0)
  const [prevMonthTotal, setPrevMonthTotal] = useState(0)

  const [form, setForm] = useState({ category: '', amount: '', expense_date: '', memo: '', note: '' })
  const [modalTab, setModalTab] = useState<'direct' | 'bank'>('direct')
  const [bankTxs, setBankTxs] = useState<any[]>([])
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set())
  const [bankCategory, setBankCategory] = useState('')
  const [bankSearch, setBankSearch] = useState('')
  const [bankDateFrom, setBankDateFrom] = useState(() => new Date().toISOString().slice(0, 7) + '-01')
  const [bankDateTo, setBankDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    const saved = localStorage.getItem('expense_categories')
    const extra: string[] = saved ? JSON.parse(saved) : []
    const merged = [...DEFAULT_CATEGORIES, ...extra.filter(c => !DEFAULT_CATEGORIES.includes(c))]
    setCategories(merged)
  }, [])

  async function load() {
    setLoading(true)
    const y = parseInt(month.slice(0, 4))
    const m = parseInt(month.slice(5, 7))
    const lastDay = new Date(y, m, 0).getDate()
    const startDate = month + '-01'
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

    // 이전달
    const prevM = m === 1 ? 12 : m - 1
    const prevY = m === 1 ? y - 1 : y
    const prevLastDay = new Date(prevY, prevM, 0).getDate()
    const prevStart = `${prevY}-${String(prevM).padStart(2,'0')}-01`
    const prevEnd = `${prevY}-${String(prevM).padStart(2,'0')}-${String(prevLastDay).padStart(2,'0')}`

    let mainQuery = supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    if (viewMode === 'month') {
      mainQuery = mainQuery.gte('expense_date', startDate).lte('expense_date', endDate)
    } else {
      // 연도 전체
      mainQuery = mainQuery.gte('expense_date', `${selYear}-01-01`).lte('expense_date', `${selYear}-12-31`)
    }

    const [{ data }, { data: yearRaw }, { data: prevRaw }] = await Promise.all([
      mainQuery,
      supabase.from('expenses').select('expense_date, amount').gte('expense_date', `${y}-01-01`).lte('expense_date', `${y}-12-31`),
      supabase.from('expenses').select('amount').gte('expense_date', prevStart).lte('expense_date', prevEnd),
    ])
    setExpenses((data ?? []) as Expense[])

    // 월별 합계
    const byMonth: Record<string, number> = {}
    for (const row of (yearRaw ?? [])) {
      const mon = row.expense_date.slice(0, 7)
      byMonth[mon] = (byMonth[mon] ?? 0) + row.amount
    }
    setYearData(byMonth)
    setYearTotal((yearRaw ?? []).reduce((s: number, r: any) => s + r.amount, 0))
    setPrevMonthTotal((prevRaw ?? []).reduce((s: number, r: any) => s + r.amount, 0))

    setLoading(false)
  }

  useEffect(() => { load() }, [month, viewMode, selYear])


  async function loadBankTxs() {
    const fromSlash = bankDateFrom.replace(/-/g, '/')
    const toSlash = bankDateTo.replace(/-/g, '/') + ' 99:99:99'
    const { data } = await supabase
      .from('bank_transactions')
      .select('id, transaction_at, withdrawal, counterparty, memo')
      .gt('withdrawal', 0)
      .gte('transaction_at', fromSlash)
      .lte('transaction_at', toSlash)
      .order('transaction_at', { ascending: false })
    setBankTxs(data ?? [])
    setSelectedBankIds(new Set())
  }

  function openNew() {
    setEditItem(null)
    setForm({ category: categories[0] ?? '', amount: '', expense_date: new Date().toISOString().slice(0, 10), memo: '', note: '' })
    setModalTab('direct')
    setBankCategory(categories[0] ?? '')
    setSelectedBankIds(new Set())
    setBankTxs([])
    setModalOpen(true)
  }

  async function handleSaveFromBank() {
    const selected = bankTxs.filter(t => selectedBankIds.has(t.id))
    if (!selected.length) return alert('항목을 선택하세요.')
    if (!bankCategory) return alert('항목을 선택하세요.')
    const rows = selected.map(t => ({
      category: bankCategory,
      amount: t.withdrawal,
      expense_date: (t.transaction_at ?? '').replace(/\//g, '-').slice(0, 10),
      memo: t.counterparty ?? null,
      note: t.memo ?? null,
    }))
    const { error } = await supabase.from('expenses').insert(rows)
    if (error) { alert('저장 실패: ' + error.message); return }
    setModalOpen(false)
    load()
  }

  function openEdit(e: Expense) {
    setEditItem(e)
    setForm({ category: e.category, amount: String(e.amount), expense_date: e.expense_date, memo: e.memo ?? '', note: e.note ?? '' })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.category || !form.amount || !form.expense_date) return alert('카테고리, 금액, 날짜를 입력해주세요.')
    const payload = {
      category: form.category,
      amount: Number(form.amount.replace(/,/g, '')),
      expense_date: form.expense_date,
      memo: form.memo || null,
      note: form.note || null,
    }
    if (editItem) {
      const { error } = await supabase.from('expenses').update(payload).eq('id', editItem.id)
      if (error) { alert('저장 실패: ' + error.message); return }
    } else {
      const { error } = await supabase.from('expenses').insert(payload)
      if (error) { alert('저장 실패: ' + error.message); return }
    }
    setModalOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  function handleAddCategory() {
    const cat = newCat.trim()
    if (!cat || categories.includes(cat)) return
    const next = [...categories, cat]
    setCategories(next)
    const extra = next.filter(c => !DEFAULT_CATEGORIES.includes(c))
    localStorage.setItem('expense_categories', JSON.stringify(extra))
    setNewCat('')
    setAddCatOpen(false)
  }

  function handleDeleteCategory(cat: string) {
    if (DEFAULT_CATEGORIES.includes(cat)) return alert('기본 항목은 삭제할 수 없습니다.')
    if (!confirm(`'${cat}' 항목을 삭제할까요?`)) return
    const next = categories.filter(c => c !== cat)
    setCategories(next)
    const extra = next.filter(c => !DEFAULT_CATEGORIES.includes(c))
    localStorage.setItem('expense_categories', JSON.stringify(extra))
  }

  const filtered = expenses.filter(e => {
    if (catFilter !== 'all' && e.category !== catFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return e.memo?.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || e.expense_date.includes(q)
    }
    return true
  })
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0)
  const totalFiltered = filtered.reduce((s, e) => s + e.amount, 0)

  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {} as Record<string, number>)

  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1])

  const printTotal = filtered.reduce((s, e) => s + e.amount, 0)

  return (
    <>
    <style>{`
      @media print {
        .no-print { display: none !important; }
        body { background: white !important; }
        aside { display: none !important; }
        header { display: none !important; }
        .print-only { display: block !important; }
        main { overflow: visible !important; }
      }
      .print-only { display: none; }
    `}</style>
    <div className="p-4 md:p-8 no-print">
      <PageHeader
        title="관리비"
        primary={{ label: '+ 지출 등록', onClick: openNew }}
        secondary={[
          { label: '항목 추가', onClick: () => setAddCatOpen(true) },
          { label: '엑셀 업로드', onClick: () => setExcelOpen(true) },
          { label: '인쇄 / PDF', onClick: () => window.print(), desktopOnly: true },
        ]}
      />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            월별
          </button>
          <button onClick={() => setViewMode('year')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'year' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            연도
          </button>
        </div>
        {viewMode === 'month' && (
          <>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={() => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
              setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
            }} className="px-3 py-2 text-sm rounded-lg border border-indigo-400 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors font-medium">
              전월
            </button>
          </>
        )}
        {viewMode === 'year' && (
          <select value={selYear} onChange={e => setSelYear(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        )}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="메모, 항목, 날짜 검색..."
          className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>



      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setCatFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            전체
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === cat ? 'bg-gray-800 text-white' : getColor(cat).badge + ' hover:opacity-80'}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 관리비 대시보드 */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 mb-4 max-w-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400 font-medium">관리비 현황</span>
            <span className="text-sm font-bold text-gray-800">{expenses.reduce((s,e)=>s+e.amount,0).toLocaleString()}원</span>
          </div>
          <span className="text-xs text-gray-400">{viewMode === 'month' ? month : '전체'}</span>
        </div>
        {(() => {
          const dashTotal = expenses.reduce((s, e) => s + e.amount, 0)
          const byCat: Record<string, number> = {}
          for (const e of expenses) byCat[e.category] = (byCat[e.category] ?? 0) + e.amount
          const sorted = Object.entries(byCat).sort(([,a],[,b]) => b - a)
          if (sorted.length === 0) return <p className="text-sm text-gray-300 text-center py-2">데이터 없음</p>
          return (
            <div className="space-y-2.5">
              {sorted.map(([cat, amt]) => {
                const pct = dashTotal > 0 ? Math.round((amt / dashTotal) * 100) : 0
                const color = getColor(cat)
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${color.badge}`}>{cat}</span>
                      <span className="text-xs text-gray-500">{amt.toLocaleString()}원 <span className="text-gray-300">{pct}%</span></span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div className={`${color.bar} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {catFilter !== 'all' && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 flex justify-between">
          <span><span className={`px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${getColor(catFilter).badge}`}>{catFilter}</span>필터 적용 중</span>
          <span className="font-bold">{totalFiltered.toLocaleString()}원</span>
        </div>
      )}

      <div className="touch-list md:hidden space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">등록된 항목이 없습니다.</div>
        ) : filtered.map(e => (
          <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getColor(e.category).badge}`}>{e.category}</span>
                <div className="text-xs text-gray-400 mt-1">{e.expense_date}</div>
                {e.memo && <div className="text-xs text-gray-500 mt-0.5">{e.memo}</div>}
              </div>
              <div className="font-bold text-gray-900">{e.amount.toLocaleString()}원</div>
            </div>
            <div className="mt-3 flex gap-3 pt-3 border-t border-gray-100">
              <button onClick={() => openEdit(e)}
                className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white">수정</button>
              <button onClick={() => handleDelete(e.id)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-500">삭제</button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{width: '110px'}} />{/* 날짜 */}
            <col style={{width: '110px'}} />{/* 항목 */}
            <col style={{width: '130px'}} />{/* 금액 */}
            <col style={{width: '30%'}} /> {/* 메모 */}
            <col />{/* 비고 */}
            <col style={{width: '90px'}} />{/* 액션 */}
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">날짜</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">항목</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">금액</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">메모</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">비고</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-400">등록된 항목이 없습니다.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs">{e.expense_date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getColor(e.category).badge}`}>{e.category}</span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{e.amount.toLocaleString()}원</td>
                <td className="px-4 py-3 text-gray-600 truncate">{e.memo ?? <span className="text-gray-300">-</span>}</td>
                <td className="px-4 py-3 text-gray-400 text-xs truncate">{e.note ?? ''}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(e)} className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">수정</button>
                    <button onClick={() => handleDelete(e.id)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h2 className="font-bold text-gray-900">{editItem ? '수정' : '관리비 등록'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 text-xl">X</button>
            </div>

            {!editItem && (
              <div className="flex border-b border-gray-200 shrink-0">
                <button onClick={() => setModalTab('direct')}
                  className={`flex-1 py-2.5 text-sm font-medium ${modalTab === 'direct' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
                  직접 입력
                </button>
                <button onClick={() => { setModalTab('bank'); loadBankTxs() }}
                  className={`flex-1 py-2.5 text-sm font-medium ${modalTab === 'bank' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
                  통장에서 선택
                </button>
              </div>
            )}

            {/* 직접 입력 탭 */}
            {(editItem || modalTab === 'direct') && (
              <>
                <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                  <div>
                    <label className="text-sm text-gray-500 block mb-1.5">항목</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-1.5">금액 *</label>
                    <input type="number" value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-1.5">날짜 *</label>
                    <input type="date" value={form.expense_date}
                      onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-1.5">메모</label>
                    <input type="text" value={form.memo}
                      onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                      placeholder="예: 홍길동 6월 급여"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 block mb-1.5">비고</label>
                    <input type="text" value={form.note}
                      onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="추가 메모"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
                  <button onClick={() => setModalOpen(false)}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600">취소</button>
                  <button onClick={handleSave}
                    className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">저장</button>
                </div>
              </>
            )}

            {/* 통장에서 선택 탭 */}
            {!editItem && modalTab === 'bank' && (
              <>
                <div className="px-4 py-3 border-b border-gray-100 shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <input type="date" value={bankDateFrom} onChange={e => setBankDateFrom(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="text-gray-400 text-xs">~</span>
                    <input type="date" value={bankDateTo} onChange={e => setBankDateTo(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button onClick={loadBankTxs}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium shrink-0">조회</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" placeholder="거래처 검색..." value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={bankCategory} onChange={e => setBankCategory(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {selectedBankIds.size > 0 && (
                    <p className="text-xs text-blue-600 font-medium">{selectedBankIds.size}건 선택 · 합계 {bankTxs.filter(t => selectedBankIds.has(t.id)).reduce((s,t) => s + (t.withdrawal ?? 0), 0).toLocaleString()}원</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {bankTxs.filter(t => !bankSearch || t.counterparty?.includes(bankSearch) || t.memo?.includes(bankSearch)).map(tx => {
                    const checked = selectedBankIds.has(tx.id)
                    return (
                      <label key={tx.id}
                        className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setSelectedBankIds(prev => { const n = new Set(prev); n.has(tx.id) ? n.delete(tx.id) : n.add(tx.id); return n })}
                          className="accent-blue-600 shrink-0" />
                        <span className="text-xs text-gray-400 shrink-0 w-24">{(tx.transaction_at ?? '').slice(0, 10)}</span>
                        <span className="text-sm font-medium text-gray-800 flex-1 truncate">{tx.counterparty}</span>
                        <span className="text-sm font-bold text-red-500 shrink-0">{(tx.withdrawal ?? 0).toLocaleString()}원</span>
                      </label>
                    )
                  })}
                  {bankTxs.length === 0 && (
                    <div className="text-center py-10 text-gray-400 text-sm">기간을 설정하고 조회하세요</div>
                  )}
                </div>
                <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
                  <button onClick={() => setModalOpen(false)}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600">취소</button>
                  <button onClick={handleSaveFromBank} disabled={selectedBankIds.size === 0}
                    className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-400 text-white text-sm font-medium">
                    {selectedBankIds.size > 0 ? `${selectedBankIds.size}건 등록` : '선택하세요'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {addCatOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-bold text-gray-900">항목 관리</h2>
              <button onClick={() => setAddCatOpen(false)} className="text-gray-400 text-xl">X</button>
            </div>
            <div className="px-6 py-5">
              <div className="space-y-2 mb-4">
                {categories.map(cat => (
                  <div key={cat} className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getColor(cat).badge}`}>{cat}</span>
                    {!DEFAULT_CATEGORIES.includes(cat) && (
                      <button onClick={() => handleDeleteCategory(cat)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newCat} onChange={e => setNewCat(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                  placeholder="새 항목명 입력"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={handleAddCategory}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium">추가</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {excelOpen && (
        <ExpensesExcelUploadModal
          categories={categories}
          onClose={() => setExcelOpen(false)}
          onSaved={() => { setExcelOpen(false); load() }}
        />
      )}
    </div>

    {/* 인쇄 전용 영역 */}
    <div className="print-only p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold">관리비 내역</h1>
        <p className="text-sm text-gray-500 mt-1">
          {viewMode === 'month' ? `${month} (${catFilter !== 'all' ? catFilter : '전체 항목'})` : `${selYear}년 (${catFilter !== 'all' ? catFilter : '전체 항목'})`}
        </p>
      </div>
      <table style={{width:'100%', borderCollapse:'collapse', fontSize:'12px'}}>
        <thead>
          <tr style={{borderBottom:'2px solid #000'}}>
            {['날짜','항목','금액','메모'].map(h => (
              <th key={h} style={{padding:'6px 8px', textAlign:'left', fontWeight:'bold'}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((e, i) => (
            <tr key={e.id} style={{borderBottom:'1px solid #ddd', background: i%2===0?'#fff':'#f9f9f9'}}>
              <td style={{padding:'5px 8px'}}>{e.expense_date}</td>
              <td style={{padding:'5px 8px'}}>{e.category}</td>
              <td style={{padding:'5px 8px', textAlign:'right'}}>{e.amount.toLocaleString()}원</td>
              <td style={{padding:'5px 8px', color:'#666'}}>{e.memo ?? ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{borderTop:'2px solid #000', fontWeight:'bold'}}>
            <td colSpan={2} style={{padding:'6px 8px'}}>합계</td>
            <td style={{padding:'6px 8px', textAlign:'right'}}>{printTotal.toLocaleString()}원</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-gray-400 mt-6 text-right">인쇄일: {new Date().toLocaleDateString('ko-KR')}</p>
    </div>
    </>
  )
}
