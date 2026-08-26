'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PurchaseInvoice, Supplier, Project } from '@/lib/types'
import PurchaseInvoiceModal from './PurchaseInvoiceModal'
import PurchaseCsvUploadModal from './CsvUploadModal'
import PageHeader from '@/components/PageHeader'

interface PurchaseInvoiceWithRelations extends PurchaseInvoice {
  supplier: Supplier
  project: Project
}

export default function PurchaseInvoicesPage() {
  const [invoices, setInvoices] = useState<PurchaseInvoiceWithRelations[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'received' | 'paid'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<PurchaseInvoiceWithRelations | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [invoiceImages, setInvoiceImages] = useState<Record<string, string>>({})
  const [viewingInvoice, setViewingInvoice] = useState<string | null>(null)
  const invoiceInputRef = useRef<HTMLInputElement>(null)
  const uploadingForRef = useRef<string | null>(null)
  const supabase = createClient()

  async function load() {
    let query = supabase.from('purchase_invoices')
      .select('*, supplier:suppliers(*), project:projects(*)')
      .order('issue_date', { ascending: false })
    if (dateFrom) query = query.gte('issue_date', dateFrom)
    if (dateTo) query = query.lte('issue_date', dateTo)
    const [{ data: invData }, { data: supData }, { data: projData }] = await Promise.all([
      query,
      supabase.from('suppliers').select('*').eq('status', 'active').order('name'),
      supabase.from('projects').select('*').order('name'),
    ])
    setInvoices((invData ?? []) as PurchaseInvoiceWithRelations[])
    setSuppliers(supData ?? [])
    setProjects(projData ?? [])
    const imgs: Record<string, string> = {}
    ;(invData ?? []).forEach((i: any) => { if (i.invoice_image_url) imgs[i.id] = i.invoice_image_url })
    setInvoiceImages(imgs)
    setLoading(false)
  }

  async function uploadInvoiceImage(id: string, file: File) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `purchase/${id}.${ext}`
    const { error } = await supabase.storage.from('invoices').upload(path, file, { upsert: true })
    if (error) { alert('업로드 실패: ' + error.message); return }
    const { data } = supabase.storage.from('invoices').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()
    await supabase.from('purchase_invoices').update({ invoice_image_url: url, status: 'paid', paid_at: new Date().toISOString() }).eq('id', id)
    setInvoiceImages(iv => ({ ...iv, [id]: url }))
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'paid' as any, invoice_image_url: url as any } : i))
  }

  async function deleteInvoiceImage(id: string) {
    const url = invoiceImages[id] ?? ''
    const path = url.split('/invoices/')[1]?.split('?')[0]
    if (path) await supabase.storage.from('invoices').remove([path])
    await supabase.from('purchase_invoices').update({ invoice_image_url: null }).eq('id', id)
    setInvoiceImages(iv => { const n = { ...iv }; delete n[id]; return n })
    setViewingInvoice(null)
  }

  async function handleAutoGenerate() {
    if (!dateFrom || !dateTo) { alert('기간을 선택해 주세요.'); return }
    if (!confirm(`${dateFrom} ~ ${dateTo} 정산 기준으로 중기업체별 매입계산서를 자동 생성할까요?`)) return

    const startDate = dateFrom
    const endDate = dateTo

    const { data: logs } = await supabase
      .from('daily_logs')
      .select('*, dispatch:dispatches(*, supplier:suppliers(*))')
      .gte('log_date', startDate)
      .lte('log_date', endDate)

    if (!logs || logs.length === 0) return alert('해당 월 일보 데이터가 없습니다.')

    const bySupplier: Record<string, { supplierId: string; supply: number }> = {}
    for (const log of logs) {
      const d = log.dispatch as any
      const supplierId = d?.supplier_id
      if (!supplierId) continue
      const supplierPrice = d?.supplier_unit_price ?? 0
      if (!bySupplier[supplierId]) bySupplier[supplierId] = { supplierId, supply: 0 }
      bySupplier[supplierId].supply += supplierPrice * log.quantity
    }

    await supabase.from('purchase_invoices').delete().gte('issue_date', startDate).lte('issue_date', endDate)

    const rows = Object.values(bySupplier).map(s => ({
      supplier_id: s.supplierId,
      issue_date: endDate,
      period_start: startDate,
      period_end: endDate,
      supply_amount: s.supply,
      vat_amount: Math.round(s.supply * 0.1),
      total_amount: Math.round(s.supply * 1.1),
      status: 'received',
    }))

    if (rows.length > 0) await supabase.from('purchase_invoices').insert(rows)
    load()
  }

  async function handleMarkPaid(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'paid' ? 'received' : 'paid'
    const extra = newStatus === 'paid' ? { paid_at: new Date().toISOString() } : { paid_at: null }
    await supabase.from('purchase_invoices').update({ status: newStatus, ...extra }).eq('id', id)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('purchase_invoices').delete().eq('id', id)
    load()
  }

  useEffect(() => { load() }, [dateFrom, dateTo])

  const filtered = invoices.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (i.supplier?.name ?? (i as any).supplier_name ?? '').toLowerCase()
      const rep = ((i as any).representative ?? '').toLowerCase()
      const nameMatch = name.includes(q) || rep.includes(q)
      const amtMatch = String(i.total_amount ?? '').includes(q.replace(/,/g, ''))
      if (!nameMatch && !amtMatch) return false
    }
    return true
  })
  const totalSupply = filtered.reduce((a, i) => a + (i.supply_amount ?? 0), 0)
  const totalVat = filtered.reduce((a, i) => a + (i.vat_amount ?? 0), 0)
  const totalAmount = filtered.reduce((a, i) => a + (i.total_amount ?? 0), 0)

  // 월별 합계
  const selYear = dateFrom ? dateFrom.slice(0, 4) : new Date().getFullYear().toString()
  const monthlyTotals = Array.from({ length: 12 }, (_, idx) => {
    const m = String(idx + 1).padStart(2, '0')
    const prefix = `${selYear}-${m}`
    const rows = invoices.filter(i => (i.issue_date ?? '').startsWith(prefix))
    const supply = rows.reduce((s, i) => s + (i.supply_amount ?? 0), 0)
    const vat = rows.reduce((s, i) => s + (i.vat_amount ?? 0), 0)
    const total = rows.reduce((s, i) => s + (i.total_amount ?? 0), 0)
    return { month: `${idx + 1}월`, supply, vat, total }
  }).filter(r => r.total > 0)

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="매입계산서"
        primary={{ label: '+ 계산서 등록', onClick: () => { setSelected(null); setModalOpen(true) } }}
        secondary={[
          { label: '자동 생성', onClick: handleAutoGenerate },
          { label: '엑셀 업로드', onClick: () => setCsvOpen(true), desktopOnly: true },
        ]}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="flex items-center gap-1">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 md:py-2" />
          <span className="text-gray-400 text-sm">~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 md:py-2" />
          <div className="flex rounded-lg overflow-hidden border border-indigo-400">
            <button onClick={() => {
              const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
              const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0')
              const last = new Date(y, d.getMonth()+1, 0).getDate()
              setDateFrom(`${y}-${m}-01`); setDateTo(`${y}-${m}-${String(last).padStart(2,'0')}`)
            }} className="px-3 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium border-r border-indigo-400">전월</button>
            <button onClick={() => {
              const now = new Date()
              const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0')
              const last = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
              setDateFrom(`${y}-${m}-01`); setDateTo(`${y}-${m}-${String(last).padStart(2,'0')}`)
            }} className="px-3 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 font-medium">당월</button>
          </div>
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo('') }} className="rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-500 hover:bg-gray-200 md:py-2">전체보기</button>}
        </div>
        <input type="text" placeholder="업체명 또는 금액 검색..." value={search} onChange={e => setSearch(e.target.value)}
          className="min-w-[180px] flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 md:py-2 md:text-sm" />
        <div className="no-scrollbar flex w-full gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 md:w-auto">
          {(['all', 'received', 'paid'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {s === 'all' ? '전체' : s === 'received' ? '미지급' : '지급완료'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">공급가액</p>
            <p className="text-xl font-bold text-gray-900">{totalSupply.toLocaleString()}원</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500 mb-1">부가세</p>
            <p className="text-xl font-bold text-gray-900">{totalVat.toLocaleString()}원</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-sm text-orange-700 mb-1">합계 (지급예정)</p>
            <p className="text-xl font-bold text-orange-700">{totalAmount.toLocaleString()}원</p>
          </div>
        </div>
      )}

      {/* 모바일 카드 */}
      <div className="touch-list md:hidden space-y-3 mb-4">
        {loading ? <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        : filtered.length === 0 ? <div className="text-center py-8 text-gray-400">매입계산서가 없습니다.</div>
        : filtered.map(inv => (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-bold text-gray-900">{inv.supplier?.name ?? (inv as any).supplier_name ?? '-'}</div>
                <div className="text-xs text-gray-400 mt-0.5">{inv.issue_date}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                {inv.status === 'paid' ? '지급완료' : '미지급'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 rounded-lg p-2 mb-3">
              <div><div className="text-xs text-gray-400">공급가</div><div className="text-sm font-medium">{inv.supply_amount?.toLocaleString()}</div></div>
              <div><div className="text-xs text-gray-400">부가세</div><div className="text-sm font-medium">{inv.vat_amount?.toLocaleString()}</div></div>
              <div><div className="text-xs text-gray-400">합계</div><div className="text-sm font-bold text-orange-700">{inv.total_amount?.toLocaleString()}</div></div>
            </div>
            {(inv as any).memo && <div className="text-xs text-gray-400 mb-2">{(inv as any).memo}</div>}
            <div className="space-y-2">
              <button
                onClick={() => handleMarkPaid(inv.id, inv.status)}
                className={`w-full rounded-lg py-3 text-sm font-bold ${inv.status === 'paid' ? 'border border-green-200 bg-green-50 text-green-700' : 'bg-orange-600 text-white'}`}>
                {inv.status === 'paid' ? '지급완료 (탭하여 취소)' : '지급완료 처리'}
              </button>
              <div className="flex gap-2">
                <button onClick={() => { setSelected(inv); setModalOpen(true) }}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600">수정</button>
                <button onClick={() => handleDelete(inv.id)}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-500">삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">발행일</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">업체명</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">사업자번호</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">대표자</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">비고(계좌)</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">현장</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">공급가액</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">부가세</th>
              <th className="text-right px-5 py-3 font-semibold text-gray-600">합계</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">상태</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={11} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} className="px-5 py-8 text-center text-gray-400">
                매입계산서가 없습니다. ⚡ 자동 생성을 눌러보세요.
              </td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-gray-500">{inv.issue_date}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{inv.supplier?.name ?? (inv as any).supplier_name ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{(inv as any).business_no ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{(inv as any).representative ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs max-w-[180px] truncate">{(inv as any).memo ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500">{inv.project?.name ?? '-'}</td>
                <td className="px-5 py-3 text-right text-gray-900">{inv.supply_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3 text-right text-gray-500">{inv.vat_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{inv.total_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {inv.status === 'paid' ? '지급완료' : '미지급'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => handleMarkPaid(inv.id, inv.status)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${inv.status === 'paid' ? 'bg-green-100 text-green-700 border-green-300 font-medium' : 'text-gray-400 border-gray-200 hover:border-green-300 hover:text-green-600'}`}>
                      {inv.status === 'paid' ? '지급완료✓' : '지급완료'}
                    </button>
                    <button onClick={() => { setSelected(inv); setModalOpen(true) }} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">수정</button>
                    <button onClick={() => handleDelete(inv.id)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 월별 합계 */}
      {!loading && monthlyTotals.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">{selYear}년 월별 발행 합계</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2 text-left font-medium">월</th>
                  <th className="px-4 py-2 text-right font-medium">공급가액</th>
                  <th className="px-4 py-2 text-right font-medium">부가세</th>
                  <th className="px-4 py-2 text-right font-medium">합계</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthlyTotals.map(r => (
                  <tr key={r.month} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{r.month}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{r.supply.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{r.vat.toLocaleString()}원</td>
                    <td className="px-4 py-2.5 text-right font-bold text-orange-700">{r.total.toLocaleString()}원</td>
                  </tr>
                ))}
                <tr className="bg-orange-50 font-bold border-t border-orange-200">
                  <td className="px-4 py-2.5 text-orange-800">합계</td>
                  <td className="px-4 py-2.5 text-right text-orange-700">{monthlyTotals.reduce((s,r)=>s+r.supply,0).toLocaleString()}원</td>
                  <td className="px-4 py-2.5 text-right text-orange-600">{monthlyTotals.reduce((s,r)=>s+r.vat,0).toLocaleString()}원</td>
                  <td className="px-4 py-2.5 text-right text-orange-800">{monthlyTotals.reduce((s,r)=>s+r.total,0).toLocaleString()}원</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 파일 업로드 input */}
      <input ref={invoiceInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; const id = uploadingForRef.current; if (f && id) uploadInvoiceImage(id, f); e.target.value = '' }} />

      {/* 계산서 이미지 미리보기 모달 */}
      {viewingInvoice && invoiceImages[viewingInvoice] && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setViewingInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-bold text-gray-800">매입계산서</span>
              <div className="flex gap-2">
                <a href={invoiceImages[viewingInvoice]} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">열기</a>
                <button onClick={() => { if (confirm('이미지를 삭제하시겠습니까?')) deleteInvoiceImage(viewingInvoice!) }}
                  className="text-xs px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">삭제</button>
                <button onClick={() => setViewingInvoice(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="p-2 max-h-[80vh] overflow-auto">
              <img src={invoiceImages[viewingInvoice]} alt="매입계산서" className="w-full rounded" />
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <PurchaseInvoiceModal invoice={selected} suppliers={suppliers} projects={projects}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}
      {csvOpen && (
        <PurchaseCsvUploadModal onClose={() => setCsvOpen(false)}
          onSaved={() => { setCsvOpen(false); load() }} />
      )}
    </div>
  )
}
