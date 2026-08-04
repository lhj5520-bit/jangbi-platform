'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Invoice, Client, Project } from '@/lib/types'
import InvoiceModal from './InvoiceModal'
import InvoiceCsvUploadModal from './CsvUploadModal'

interface InvoiceWithRelations extends Invoice {
  client: Client
  project: Project
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'issued' | 'paid'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<InvoiceWithRelations | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [invoiceImages, setInvoiceImages] = useState<Record<string, string>>({})
  const [viewingInvoice, setViewingInvoice] = useState<string | null>(null)
  const invoiceInputRef = useRef<HTMLInputElement>(null)
  const uploadingForRef = useRef<string | null>(null)
  const supabase = createClient()

  async function load() {
    let query = supabase.from('invoices')
      .select('*, client:clients(*), project:projects(*)')
      .order('issue_date', { ascending: false })
    if (month) {
      query = query.gte('issue_date', month + '-01').lte('issue_date', month + '-31')
    }
    const [{ data: invData }, { data: cliData }, { data: projData }] = await Promise.all([
      query,
      supabase.from('clients').select('*').order('name'),
      supabase.from('projects').select('*').order('name'),
    ])
    setInvoices((invData ?? []) as InvoiceWithRelations[])
    setClients(cliData ?? [])
    setProjects(projData ?? [])
    const imgs: Record<string, string> = {}
    ;(invData ?? []).forEach((i: any) => { if (i.invoice_image_url) imgs[i.id] = i.invoice_image_url })
    setInvoiceImages(imgs)
    setLoading(false)
  }

  async function uploadInvoiceImage(id: string, file: File) {
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `sales/${id}.${ext}`
    const { error } = await supabase.storage.from('invoices').upload(path, file, { upsert: true })
    if (error) { alert('업로드 실패: ' + error.message); return }
    const { data } = supabase.storage.from('invoices').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()
    await supabase.from('invoices').update({ invoice_image_url: url }).eq('id', id)
    setInvoiceImages(iv => ({ ...iv, [id]: url }))
  }

  async function deleteInvoiceImage(id: string) {
    const url = invoiceImages[id] ?? ''
    const path = url.split('/invoices/')[1]?.split('?')[0]
    if (path) await supabase.storage.from('invoices').remove([path])
    await supabase.from('invoices').update({ invoice_image_url: null }).eq('id', id)
    setInvoiceImages(iv => { const n = { ...iv }; delete n[id]; return n })
    setViewingInvoice(null)
  }

  async function handleAutoInvoice() {
    if (!confirm(month + ' 월 일보 기준으로 발주처별 세금계산서를 자동 생성할까요?')) return
    const startDate = month + '-01'
    const endDate = month + '-31'
    const { data: logs } = await supabase
      .from('daily_logs')
      .select('*, dispatch:dispatches(*, project:projects(*, client:clients(*)))')
      .gte('log_date', startDate)
      .lte('log_date', endDate)
    if (!logs || logs.length === 0) return alert('해당 월 일보 데이터가 없습니다.')
    const byClient: Record<string, { clientId: string; projectId: string; supply: number }> = {}
    for (const log of logs) {
      const d = log.dispatch as any
      const clientId = d?.project?.client?.id
      const projectId = d?.project?.id
      if (!clientId) continue
      const clientPrice = d?.client_unit_price ?? 0
      const key = clientId + '_' + projectId
      if (!byClient[key]) byClient[key] = { clientId, projectId, supply: 0 }
      byClient[key].supply += clientPrice * log.quantity
    }
    await supabase.from('invoices').delete().gte('issue_date', startDate).lte('issue_date', endDate)
    const rows = Object.values(byClient).map(c => ({
      client_id: c.clientId,
      project_id: c.projectId,
      issue_date: endDate,
      period_start: startDate,
      period_end: endDate,
      supply_amount: c.supply,
      vat_amount: Math.round(c.supply * 0.1),
      total_amount: Math.round(c.supply * 1.1),
      status: 'issued',
    }))
    if (rows.length > 0) await supabase.from('invoices').insert(rows)
    load()
  }

  async function handleMarkPaid(id: string) {
    await supabase.from('invoices').update({ status: 'paid' }).eq('id', id)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('invoices').delete().eq('id', id)
    load()
  }

  useEffect(() => { load() }, [month])

  const filtered = invoices.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (clientFilter !== 'all') {
      const clientName = i.client?.name ?? (i as any).client_name ?? ''
      if (clientName !== clientFilter) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const name = (i.client?.name ?? (i as any).client_name ?? '').toLowerCase()
      const proj = (i.project?.name ?? '').toLowerCase()
      const amt = String(i.total_amount ?? '').replace(/,/g, '')
      if (!name.includes(q) && !proj.includes(q) && !amt.includes(q.replace(/,/g, ''))) return false
    }
    return true
  })

  const totalSupply = filtered.reduce((a, i) => a + (i.supply_amount ?? 0), 0)
  const totalVat = filtered.reduce((a, i) => a + (i.vat_amount ?? 0), 0)
  const totalAmount = filtered.reduce((a, i) => a + (i.total_amount ?? 0), 0)
  const paidAmount = filtered.filter(i => i.status === 'paid').reduce((a, i) => a + (i.total_amount ?? 0), 0)
  const unpaidAmount = totalAmount - paidAmount

  // 발주처별 집계
  const byClient = invoices.reduce((acc, inv) => {
    const name = inv.client?.name ?? (inv as any).client_name ?? '미상'
    if (!acc[name]) acc[name] = { total: 0, paid: 0, count: 0 }
    acc[name].total += inv.total_amount ?? 0
    if (inv.status === 'paid') acc[name].paid += inv.total_amount ?? 0
    acc[name].count++
    return acc
  }, {} as Record<string, { total: number; paid: number; count: number }>)
  const sortedClients = Object.entries(byClient).sort((a, b) => b[1].total - a[1].total)
  const grandTotal = invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0)

  // 발주처 목록 (필터용)
  const clientNames = Array.from(new Set(invoices.map(i => i.client?.name ?? (i as any).client_name ?? '').filter(Boolean)))

  // 월별 합계 (전체 데이터 기준, 연도별)
  const selYear = month ? month.slice(0, 4) : new Date().getFullYear().toString()
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">매출계산서</h1>
        <div className="flex gap-2">
          <button onClick={() => setCsvOpen(true)}
            className="hidden md:block bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            📂 엑셀 업로드
          </button>
          {month && (
            <button onClick={handleAutoInvoice}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
              ⚡ 자동
            </button>
          )}
          <button onClick={() => { setSelected(null); setModalOpen(true) }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + 등록
          </button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 items-center">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {month && (
            <button onClick={() => setMonth('')}
              className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200">
              전체
            </button>
          )}
        </div>
        <input type="text" placeholder="업체명, 현장명, 금액 검색..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['all', 'issued', 'paid'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s === 'all' ? '전체' : s === 'issued' ? '발행' : '수금완료'}
            </button>
          ))}
        </div>
      </div>

      {/* 대시보드 */}
      {!loading && invoices.length > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">공급가액</p>
              <p className="text-lg font-bold text-gray-900">{totalSupply.toLocaleString()}원</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">부가세</p>
              <p className="text-lg font-bold text-gray-900">{totalVat.toLocaleString()}원</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-600 mb-1">수금완료</p>
              <p className="text-lg font-bold text-green-700">{paidAmount.toLocaleString()}원</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-500 mb-1">미수금</p>
              <p className="text-lg font-bold text-red-600">{unpaidAmount.toLocaleString()}원</p>
            </div>
          </div>

        </div>
      )}

      {/* 모바일 카드 */}
      <div className="md:hidden space-y-3 mb-4">
        {loading ? <div className="text-center py-8 text-gray-400">불러오는 중...</div>
        : filtered.length === 0 ? <div className="text-center py-8 text-gray-400">세금계산서가 없습니다.</div>
        : filtered.map(inv => (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-bold text-gray-900">{inv.client?.name ?? (inv as any).client_name ?? '-'}</div>
                <div className="text-xs text-gray-400 mt-0.5">{inv.issue_date} · {inv.project?.name ?? '-'}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {inv.status === 'paid' ? '수금완료' : '발행'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center bg-gray-50 rounded-lg p-2 mb-3">
              <div><div className="text-xs text-gray-400">공급가</div><div className="text-sm font-medium">{inv.supply_amount?.toLocaleString()}</div></div>
              <div><div className="text-xs text-gray-400">부가세</div><div className="text-sm font-medium">{inv.vat_amount?.toLocaleString()}</div></div>
              <div><div className="text-xs text-gray-400">합계</div><div className="text-sm font-bold text-blue-700">{inv.total_amount?.toLocaleString()}</div></div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { if (invoiceImages[inv.id]) { setViewingInvoice(inv.id) } else { uploadingForRef.current = inv.id; invoiceInputRef.current?.click() } }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${inv.status === 'issued' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
                {invoiceImages[inv.id] ? '발행📄' : '발행'}
              </button>
              {inv.status === 'issued' && (
                <button onClick={() => handleMarkPaid(inv.id)}
                  className="flex-1 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium">수금완료</button>
              )}
              <button onClick={() => { setSelected(inv); setModalOpen(true) }}
                className="flex-1 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">수정</button>
              <button onClick={() => handleDelete(inv.id)}
                className="flex-1 py-1.5 rounded-lg bg-red-50 text-red-500 text-sm font-medium">삭제</button>
            </div>
          </div>
        ))}
      </div>

      {/* 데스크탑 테이블 */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-5 py-3 font-semibold text-gray-600">발행일</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">발주처</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">사업자번호</th>
              <th className="text-left px-5 py-3 font-semibold text-gray-600">대표자</th>
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
              <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">세금계산서가 없습니다.</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 text-gray-500">{inv.issue_date}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{inv.client?.name ?? (inv as any).client_name ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{(inv as any).business_no ?? '-'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{(inv as any).representative ?? '-'}</td>
                <td className="px-5 py-3 text-gray-600">{inv.project?.name ?? '-'}</td>
                <td className="px-5 py-3 text-right text-gray-900">{inv.supply_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3 text-right text-gray-600">{inv.vat_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">{inv.total_amount?.toLocaleString()}원</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {inv.status === 'paid' ? '수금완료' : '발행'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => { if (invoiceImages[inv.id]) { setViewingInvoice(inv.id) } else { uploadingForRef.current = inv.id; invoiceInputRef.current?.click() } }}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${inv.status === 'issued' ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium hover:bg-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {invoiceImages[inv.id] ? '발행📄' : '발행'}
                    </button>
                    {inv.status === 'issued' && (
                      <button onClick={() => handleMarkPaid(inv.id)}
                        className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200">수금완료</button>
                    )}
                    <button onClick={() => { setSelected(inv); setModalOpen(true) }}
                      className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">수정</button>
                    <button onClick={() => handleDelete(inv.id)}
                      className="text-xs px-2 py-1 rounded bg-red-100 text-red-600 hover:bg-red-200">삭제</button>
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
                    <td className="px-4 py-2.5 text-right font-bold text-blue-700">{r.total.toLocaleString()}원</td>
                  </tr>
                ))}
                <tr className="bg-blue-50 font-bold border-t border-blue-200">
                  <td className="px-4 py-2.5 text-blue-800">합계</td>
                  <td className="px-4 py-2.5 text-right text-blue-700">{monthlyTotals.reduce((s,r)=>s+r.supply,0).toLocaleString()}원</td>
                  <td className="px-4 py-2.5 text-right text-blue-600">{monthlyTotals.reduce((s,r)=>s+r.vat,0).toLocaleString()}원</td>
                  <td className="px-4 py-2.5 text-right text-blue-800">{monthlyTotals.reduce((s,r)=>s+r.total,0).toLocaleString()}원</td>
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
              <span className="font-bold text-gray-800">매출계산서</span>
              <div className="flex gap-2">
                <a href={invoiceImages[viewingInvoice]} target="_blank" rel="noreferrer"
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100">열기</a>
                <button onClick={() => { if (confirm('이미지를 삭제하시겠습니까?')) deleteInvoiceImage(viewingInvoice!) }}
                  className="text-xs px-3 py-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100">삭제</button>
                <button onClick={() => setViewingInvoice(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>
            </div>
            <div className="p-2 max-h-[80vh] overflow-auto">
              <img src={invoiceImages[viewingInvoice]} alt="매출계산서" className="w-full rounded" />
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <InvoiceModal invoice={selected} clients={clients} projects={projects}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }} />
      )}
      {csvOpen && (
        <InvoiceCsvUploadModal onClose={() => setCsvOpen(false)}
          onSaved={() => { setCsvOpen(false); load() }} />
      )}
    </div>
  )
}
