'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const SHEETS = [
  { key: 'invoices',          label: '매출계산서',    icon: '💰' },
  { key: 'purchase_invoices', label: '매입계산서',    icon: '🛒' },
  { key: 'vat_payments',      label: '부가세',       icon: '💵' },
  { key: 'bank_transactions', label: '통장내역',     icon: '🏦' },
  { key: 'expenses',          label: '관리비',       icon: '🧾' },
  { key: 'dispatch_ledger',   label: '배차내역서', icon: '📄', custom: true },
]

export default function ExportPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  async function handleExport() {
    setLoading(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()

      for (const sheet of SHEETS) {
        setProgress(`${sheet.label} 불러오는 중...`)
        let rows: any[] = []

        if ((sheet as any).custom && sheet.key === 'dispatch_ledger') {
          const { data } = await supabase.from('daily_logs').select(`
            log_date, quantity, engineer_daily_wage, is_paid, driver_name, work_content,
            dispatch:dispatches(client_name, site_name, driver_name, client_unit_price, supplier_unit_price, equipment:equipment(type,plate_no,spec), supplier:suppliers(name))
          `).order('log_date', { ascending: false })
          const typeMap: Record<string,string> = { excavator:'굴삭기', dump:'덤프', cargo:'화물', truck:'화물' }
          rows = (data ?? []).map((log: any) => {
            const d = log.dispatch ?? {}
            const eq = d.equipment ?? {}
            const qty = log.quantity ?? 0
            return {
              날짜: log.log_date,
              장비구분: typeMap[eq.type] ?? eq.type ?? '',
              차량번호: eq.plate_no ?? '',
              규격: eq.spec ?? '',
              가동시간: qty,
              단가: d.client_unit_price ?? 0,
              매출액: Math.round(qty * (d.client_unit_price ?? 0)),
              발주처: d.client_name ?? '',
              현장명: d.site_name ?? '',
              차주명: d.driver_name ?? '',
              급여: log.engineer_daily_wage ?? Math.round(qty * (d.supplier_unit_price ?? 0)),
              수금여부: log.is_paid ? '수금' : '미수',
            }
          })
        } else {
          const { data, error } = await supabase.from(sheet.key).select('*').order('created_at', { ascending: false })
          if (error) { console.error(sheet.key, error); continue }
          rows = data ?? []
        }

        if (rows.length === 0) {
          const ws = XLSX.utils.aoa_to_sheet([['데이터 없음']])
          XLSX.utils.book_append_sheet(wb, ws, sheet.label)
          continue
        }
        const ws = XLSX.utils.json_to_sheet(rows)
        XLSX.utils.book_append_sheet(wb, ws, sheet.label)
      }

      setProgress('파일 생성 중...')
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `가온건설중기_전체데이터_${today}.xlsx`)
      setProgress('')
    } catch (e) {
      alert('오류: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-2">전체 데이터 내려받기</h1>
      <p className="text-sm text-gray-500 mb-6">아래 항목이 각각 별도 시트로 저장된 엑셀 파일로 다운로드됩니다.</p>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-6">
        {SHEETS.map(s => (
          <div key={s.key} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700">
            <span className="text-base">{s.icon}</span>
            <span>{s.label}</span>
            <span className="ml-auto text-xs text-gray-400">시트 1개</span>
          </div>
        ))}
      </div>

      <button
        onClick={handleExport}
        disabled={loading}
        className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors">
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            <span>{progress || '처리 중...'}</span>
          </>
        ) : (
          <>📥 엑셀 전체 내려받기</>
        )}
      </button>
    </div>
  )
}
