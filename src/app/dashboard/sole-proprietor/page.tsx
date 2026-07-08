'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Company { id: string; name: string; ceo_name: string; business_no: string; revenue_limit: number; sort_order: number }
interface Rec { id?: string; sole_proprietor_id: string; year: number; month: number; invoice_amount: number; purchase_amount: number; paid_vat: number }

const MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12]

const SEED_COMPANIES = [
  { name: '강토가온건설중기', ceo_name: '이영규', business_no: '305-06-80236', revenue_limit: 150000000, sort_order: 1 },
  { name: '도담중기',         ceo_name: '김영선', business_no: '169-27-01834', revenue_limit: 150000000, sort_order: 2 },
  { name: '케이제이중기',     ceo_name: '이현정', business_no: '546-33-01236', revenue_limit: 150000000, sort_order: 3 },
  { name: '가온건설중기',     ceo_name: '김나영', business_no: '416-49-00903', revenue_limit: 150000000, sort_order: 4 },
  { name: '가온건설중기',     ceo_name: '홍정윤', business_no: '220-12-07518', revenue_limit: 100000000, sort_order: 5 },
]

// 2026년 월별 매출 [1월..12월]
const SEED_MONTHLY_2026: Record<string, number[]> = {
  '강토가온건설중기': [15000000, 15000000, 7612500, 8987500, 680000, 0, 0, 0, 0, 0, 0, 0],
  '도담중기':         [15000000, 0, 0, 30000000, 30000000, 0, 0, 0, 0, 0, 0, 0],
  '케이제이중기':     [70000000, 0, 0, 30000000, 20000000, 0, 0, 0, 0, 0, 0, 0],
  '가온건설중기(김나영)': [20000000, 0, 0, 0, 30000000, 0, 0, 0, 0, 0, 0, 0],
  '가온건설중기(홍정윤)': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}

// 2025년 연간 데이터 (month=0)
const SEED_ANNUAL_2025: Record<string, { invoice: number; purchase: number; paid_vat: number }> = {
  '강토가온건설중기': { invoice: 175257455, purchase: 63727974, paid_vat: 360000 },
  '도담중기':         { invoice: 100500000, purchase: 0,         paid_vat: 1180000 },
  '케이제이중기':     { invoice: 225710000, purchase: 262098241, paid_vat: 881000 },
  '가온건설중기(김나영)': { invoice: 120000000, purchase: 4000, paid_vat: 1582000 },
  '가온건설중기(홍정윤)': { invoice: 0, purchase: 0, paid_vat: 0 },
}

// 2026년 연간 데이터 (month=0) - 매입, 기납부부가세
const SEED_ANNUAL_2026: Record<string, { purchase: number; paid_vat: number }> = {
  '강토가온건설중기': { purchase: 132619783, paid_vat: 0 },
  '도담중기':         { purchase: 265013,    paid_vat: 1654000 },
  '케이제이중기':     { purchase: 580284,    paid_vat: 0 },
  '가온건설중기(김나영)': { purchase: 0, paid_vat: 2921000 },
  '가온건설중기(홍정윤)': { purchase: 0, paid_vat: 0 },
}
const REP_COLORS = ['text-blue-500','text-blue-500','text-blue-500','text-orange-500','text-red-500']

function EditCell({ value, onSave, className = '' }: { value: number; onSave: (v: number) => void; className?: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (editing) return (
    <input autoFocus type="text" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { onSave(Number(draft.replace(/,/g, '')) || 0); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-full px-3 py-2 text-sm text-right border-2 border-blue-400 outline-none bg-blue-50" />
  )
  return (
    <div onClick={() => { setDraft(value ? String(value) : ''); setEditing(true) }}
      className={`px-4 py-2.5 text-sm text-right cursor-pointer hover:bg-blue-50 select-none min-h-[38px] ${className}`}>
      {value ? value.toLocaleString() : <span className="text-gray-400">-</span>}
    </div>
  )
}

function CompanyModal({ company, onClose, onSaved }: { company?: Company; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient()
  const [form, setForm] = useState({ name: company?.name ?? '', ceo_name: company?.ceo_name ?? '', business_no: company?.business_no ?? '', revenue_limit: String(company?.revenue_limit ?? 150000000) })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  async function save() {
    const data = { name: form.name, ceo_name: form.ceo_name, business_no: form.business_no, revenue_limit: Number(form.revenue_limit.replace(/,/g, '')) || 150000000 }
    if (company?.id) await supabase.from('sole_proprietors').update(data).eq('id', company.id)
    else await supabase.from('sole_proprietors').insert(data)
    onSaved()
  }
  async function del() {
    if (!company?.id || !confirm('삭제하시겠습니까?')) return
    await supabase.from('sole_proprietors').delete().eq('id', company.id)
    onSaved()
  }
  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b"><div className="font-bold">{company ? '업체 수정' : '업체 추가'}</div><button onClick={onClose} className="text-gray-400 text-xl">&times;</button></div>
        <div className="px-5 py-4 space-y-3">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">업체명</label><input className={inp} value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">대표자</label><input className={inp} value={form.ceo_name} onChange={e => set('ceo_name', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">사업자등록번호</label><input className={inp} value={form.business_no} onChange={e => set('business_no', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">한도</label><input className={inp} value={form.revenue_limit} onChange={e => set('revenue_limit', e.target.value)} /></div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          {company && <button onClick={del} className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50">삭제</button>}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg">취소</button>
          <button onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg">저장</button>
        </div>
      </div>
    </div>
  )
}

export default function SoleProprietorPage() {
  const supabase = createClient()
  const [year, setYear] = useState(new Date().getFullYear())
  const [companies, setCompanies] = useState<Company[]>([])
  const [records, setRecords] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [modal, setModal] = useState<'add' | Company | null>(null)
  const prevYear = year - 1
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const handler = () => setHeaderCollapsed(el.scrollTop > 50)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [loading])

  async function seed() {
    setSeeding(true)
    const { data: inserted, error: insErr } = await supabase
      .from('sole_proprietors').insert(SEED_COMPANIES).select()
    if (insErr || !inserted) {
      setLoadError(`데이터 삽입 실패: ${insErr?.message ?? '알 수 없는 오류'}`)
      setSeeding(false); setLoading(false); return
    }
    // map name→id (가온건설중기 두 개는 ceo_name으로 구분)
    const idMap: Record<string, string> = {}
    for (const c of inserted) {
      const key = c.name === '가온건설중기'
        ? `가온건설중기(${c.ceo_name})`
        : c.name
      idMap[key] = c.id
    }
    const recs: any[] = []
    for (const [key, id] of Object.entries(idMap)) {
      const monthly = SEED_MONTHLY_2026[key] ?? []
      for (let i = 0; i < 12; i++) {
        if (monthly[i]) recs.push({ sole_proprietor_id: id, year: 2026, month: i + 1, invoice_amount: monthly[i], purchase_amount: 0, paid_vat: 0 })
      }
      const a25 = SEED_ANNUAL_2025[key]
      if (a25) recs.push({ sole_proprietor_id: id, year: 2025, month: 0, invoice_amount: a25.invoice, purchase_amount: a25.purchase, paid_vat: a25.paid_vat })
      const a26 = SEED_ANNUAL_2026[key]
      if (a26 && (a26.purchase || a26.paid_vat)) recs.push({ sole_proprietor_id: id, year: 2026, month: 0, invoice_amount: 0, purchase_amount: a26.purchase, paid_vat: a26.paid_vat })
    }
    if (recs.length) await supabase.from('sole_proprietor_records').insert(recs)
    setSeeding(false)
    await fetchAll()
  }

  async function fetchAll() {
    const [{ data: cos, error: cosErr }, { data: recs }, { data: prevRecs }] = await Promise.all([
      supabase.from('sole_proprietors').select('*').order('sort_order').order('created_at'),
      supabase.from('sole_proprietor_records').select('*').eq('year', year),
      supabase.from('sole_proprietor_records').select('*').eq('year', prevYear).eq('month', 0),
    ])
    if (cosErr) { setLoadError(`오류: ${cosErr.message}`); setLoading(false); return }
    setCompanies(cos ?? [])
    setRecords([...(recs ?? []), ...(prevRecs ?? [])])
    setLoading(false)
  }

  async function load() {
    setLoading(true)
    setLoadError(null)
    const { data: cos, error: cosErr } = await supabase.from('sole_proprietors').select('id').limit(1)
    if (cosErr) { setLoadError(`테이블 오류: ${cosErr.message}`); setLoading(false); return }
    if (!cos || cos.length === 0) { await seed(); return }
    await fetchAll()
  }

  useEffect(() => { load() }, [year])

  function getRec(cid: string, yr: number, m: number) { return records.find(r => r.sole_proprietor_id === cid && r.year === yr && r.month === m) }
  function getInv(cid: string, m: number) { return getRec(cid, year, m)?.invoice_amount ?? 0 }
  function getSales(cid: string) { return MONTHS.reduce((s, m) => s + getInv(cid, m), 0) }
  function getPrev(cid: string, f: 'invoice_amount' | 'purchase_amount' | 'paid_vat') { return getRec(cid, prevYear, 0)?.[f] ?? 0 }
  function getCurPurchase(cid: string) { return getRec(cid, year, 0)?.purchase_amount ?? 0 }
  function getCurPaidVat(cid: string) { return getRec(cid, year, 0)?.paid_vat ?? 0 }

  async function saveRec(cid: string, yr: number, m: number, field: 'invoice_amount' | 'purchase_amount' | 'paid_vat', val: number) {
    const existing = getRec(cid, yr, m)
    if (existing?.id) {
      await supabase.from('sole_proprietor_records').update({ [field]: val }).eq('id', existing.id)
      setRecords(prev => prev.map(r => r.id === existing.id ? { ...r, [field]: val } : r))
    } else {
      const nr = { sole_proprietor_id: cid, year: yr, month: m, invoice_amount: 0, purchase_amount: 0, paid_vat: 0, [field]: val }
      const { data } = await supabase.from('sole_proprietor_records').insert(nr).select().single()
      if (data) setRecords(prev => [...prev, data])
    }
  }

  async function handleExcelDownload() {
    const XLSX = await import('xlsx')
    const rows: any[][] = [
      ['항목', ...companies.map(c => c.name)],
      ['대표자', ...companies.map(c => c.ceo_name)],
      ['사업자등록번호', ...companies.map(c => c.business_no)],
      ...MONTHS.map(m => [`${m}월`, ...companies.map(c => getInv(c.id, m) || '')]),
      ['매출', ...companies.map(c => getSales(c.id))],
      [`${prevYear}매출`, ...companies.map(c => getPrev(c.id, 'invoice_amount') || '')],
      [`${prevYear}매입`, ...companies.map(c => getPrev(c.id, 'purchase_amount') || '')],
      [`${prevYear}종합`, ...companies.map(c => getPrev(c.id, 'paid_vat') || '')],
      ['한도', ...companies.map(c => c.revenue_limit)],
      ['차액', ...companies.map(c => c.revenue_limit - getSales(c.id))],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${year}년`)
    XLSX.writeFile(wb, `개인사업자관리_${year}.xlsx`)
  }

  // table cell style
  const lbl = 'border-b border-r border-gray-200 px-4 py-2.5 text-sm text-gray-700 font-medium bg-white sticky left-0 z-10 min-w-[130px]'
  const td = 'border-b border-r border-gray-200 min-w-[150px]'
  const tdC = 'border-b border-r border-gray-200 px-4 py-2.5 text-sm text-center min-w-[150px]'

  if (loading || seeding) return <div className="p-8 text-sm text-gray-400">{seeding ? '초기 데이터 삽입 중...' : '불러오는 중...'}</div>
  if (loadError) return <div className="p-8 text-sm text-red-500">{loadError}</div>

  return (
    <div className="p-3 md:p-8 bg-gray-50 min-h-screen">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-gray-900">월별 매출 현황</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs shadow-sm cursor-pointer">
            <span>📅</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="font-medium text-gray-800 outline-none bg-transparent cursor-pointer">
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </label>
          <button onClick={handleExcelDownload}
            className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            ↓ 엑셀
          </button>
          <button onClick={() => setModal('add')}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-2 py-1.5 text-xs font-medium shadow-sm">
            + 추가
          </button>
        </div>
      </div>

      {/* 테이블 카드 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div ref={tableScrollRef} className="overflow-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-20 bg-white">
              {/* 업체명 헤더 */}
              <tr>
                <th className="border-b border-r border-gray-200 px-4 py-3.5 text-sm font-semibold text-white text-left bg-[#1e3a5f] sticky left-0 z-20 min-w-[130px]">
                  사업장명
                </th>
                {companies.map((c, i) => (
                  <th key={c.id} className="border-b border-r border-gray-200 px-4 py-3 bg-[#eef2ff] min-w-[150px]">
                    <button onClick={() => setModal(c)} className="w-full text-center">
                      <div className="text-sm font-bold text-gray-900">{c.name}</div>
                    </button>
                  </th>
                ))}
              </tr>
              {/* 대표자 행 */}
              {!headerCollapsed && <tr>
                <td className={lbl}>대표자</td>
                {companies.map(c => (
                  <td key={c.id} className="border-b border-r border-gray-200 px-4 py-2.5 text-sm text-gray-700 text-center font-medium">{c.ceo_name}</td>
                ))}
              </tr>}
              {/* 사업자번호 행 */}
              {!headerCollapsed && <tr>
                <td className={lbl}>사업자번호</td>
                {companies.map(c => (
                  <td key={c.id} className="border-b border-r border-gray-200 px-4 py-2.5 text-sm text-gray-500 text-center tracking-wide">{c.business_no}</td>
                ))}
              </tr>}
            </thead>
            <tbody>
              {/* 월별 */}
              {MONTHS.map(m => (
                <tr key={m} className="hover:bg-gray-50 transition-colors">
                  <td className={lbl}>{m}월</td>
                  {companies.map(c => (
                    <td key={c.id} className={td}>
                      <EditCell value={getInv(c.id, m)} onSave={v => saveRec(c.id, year, m, 'invoice_amount', v)} />
                    </td>
                  ))}
                </tr>
              ))}

              {/* 매출 합계 */}
              <tr className="bg-[#fef9ec]">
                <td className="border-b border-r border-gray-200 px-4 py-3 text-sm font-bold text-gray-900 bg-[#fef9ec] sticky left-0 z-10">매출</td>
                {companies.map(c => {
                  const s = getSales(c.id)
                  return (
                    <td key={c.id} className="border-b border-r border-gray-200 px-4 py-3 text-sm font-bold text-right">
                      {s ? s.toLocaleString() : <span className="text-red-500">0</span>}
                    </td>
                  )
                })}
              </tr>

              {/* 전년도 매출 */}
              <tr className="hover:bg-gray-50">
                <td className={lbl}>{prevYear}매출</td>
                {companies.map(c => {
                  const v = getPrev(c.id, 'invoice_amount')
                  const isRed = v > 0 && v >= c.revenue_limit * 0.65
                  return (
                    <td key={c.id} className={td}>
                      <EditCell value={v} onSave={val => saveRec(c.id, prevYear, 0, 'invoice_amount', val)}
                        className={isRed ? 'text-red-500' : ''} />
                    </td>
                  )
                })}
              </tr>

              {/* 전년도 매입 */}
              <tr className="hover:bg-gray-50">
                <td className={lbl}>{prevYear}매입</td>
                {companies.map(c => {
                  const v = getPrev(c.id, 'purchase_amount')
                  return (
                    <td key={c.id} className={td}>
                      <EditCell value={v} onSave={val => saveRec(c.id, prevYear, 0, 'purchase_amount', val)}
                        className={v > 0 && v < 100000 ? 'text-red-500' : ''} />
                    </td>
                  )
                })}
              </tr>

              {/* 전년도 종합 */}
              <tr className="hover:bg-gray-50">
                <td className={lbl}>{prevYear}종합</td>
                {companies.map(c => {
                  const v = getPrev(c.id, 'paid_vat')
                  return (
                    <td key={c.id} className={td}>
                      <EditCell value={v} onSave={val => saveRec(c.id, prevYear, 0, 'paid_vat', val)}
                        className={v ? 'text-orange-500 font-medium' : ''} />
                    </td>
                  )
                })}
              </tr>

              {/* 한도 */}
              <tr className="hover:bg-gray-50">
                <td className={lbl}>한도</td>
                {companies.map(c => (
                  <td key={c.id} className="border-b border-r border-gray-200 px-4 py-2.5 text-sm text-right text-gray-700">
                    {c.revenue_limit.toLocaleString()}
                  </td>
                ))}
              </tr>

              {/* 차액 (한도-매출) */}
              <tr className="bg-[#fff5f5]">
                <td className="border-b border-r border-gray-200 px-4 py-3 text-sm font-bold text-gray-900 bg-[#fff5f5] sticky left-0 z-10">차액</td>
                {companies.map(c => (
                  <td key={c.id} className="border-b border-r border-gray-200 px-4 py-3 text-sm font-bold text-right text-red-500">
                    {(c.revenue_limit - getSales(c.id)).toLocaleString()}
                  </td>
                ))}
              </tr>

              {/* 구분선 */}
              <tr><td colSpan={companies.length + 1} className="h-2 bg-gray-100 border-b border-gray-200" /></tr>

              {/* 매입 */}
              <tr className="hover:bg-gray-50">
                <td className={lbl}>매입</td>
                {companies.map(c => (
                  <td key={c.id} className={td}>
                    <EditCell value={getCurPurchase(c.id)} onSave={v => saveRec(c.id, year, 0, 'purchase_amount', v)} />
                  </td>
                ))}
              </tr>

              {/* 예상부가세 */}
              <tr className="bg-[#fff8f0]">
                <td className="border-b border-r border-gray-200 px-4 py-2.5 text-sm font-bold text-orange-700 bg-[#fff8f0] sticky left-0 z-10">예상부가세</td>
                {companies.map(c => {
                  const vat = Math.round((getSales(c.id) - getCurPurchase(c.id)) * 0.1)
                  return (
                    <td key={c.id} className="border-b border-r border-gray-200 px-4 py-2.5 text-sm text-right font-semibold text-orange-600">
                      {vat ? vat.toLocaleString() : <span className="text-gray-400">-</span>}
                    </td>
                  )
                })}
              </tr>

              {/* 기납부부가세 */}
              <tr className="hover:bg-gray-50">
                <td className={lbl}>기납부부가세</td>
                {companies.map(c => (
                  <td key={c.id} className={td}>
                    <EditCell value={getCurPaidVat(c.id)} onSave={v => saveRec(c.id, year, 0, 'paid_vat', v)} />
                  </td>
                ))}
              </tr>

              {/* 납부할 부가세 */}
              <tr className="bg-[#fff5f5]">
                <td className="border-b border-r border-gray-200 px-4 py-3 text-sm font-bold text-gray-900 bg-[#fff5f5] sticky left-0 z-10">납부할 부가세</td>
                {companies.map(c => {
                  const vat = Math.round((getSales(c.id) - getCurPurchase(c.id)) * 0.1)
                  const final = vat - getCurPaidVat(c.id)
                  return (
                    <td key={c.id} className={`border-b border-r border-gray-200 px-4 py-3 text-sm font-bold text-right ${final > 0 ? 'text-red-500' : 'text-green-600'}`}>
                      {final ? final.toLocaleString() : <span className="text-gray-400">-</span>}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'add' && <CompanyModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
      {modal && modal !== 'add' && <CompanyModal company={modal as Company} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />}
    </div>
  )
}
