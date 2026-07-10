'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LogModal from './daily-logs/LogModal'
function MemoWidget() {
  const supabase = createClient()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      const meta = user?.user_metadata?.dashboard_memo
      setText(meta ?? localStorage.getItem('dashboard_memo') ?? '')
    })
  }, [])
  async function save() {
    try {
      localStorage.setItem('dashboard_memo', text)
    } catch {}
    await supabase.auth.updateUser({ data: { dashboard_memo: text } })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }
  return (
    <div className="mb-5 rounded-lg border-2 border-red-400 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100">
        <span className="text-sm font-semibold text-red-600">📝 메모장</span>
        <button onClick={save}
          className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
            saved ? 'bg-green-500 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          }`}>
          {saved ? '✅ 저장됨' : '저장'}
        </button>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() } }}
        placeholder="여기에 메모를 입력하세요... (Ctrl+S 로 저장)"
        className="w-full px-4 py-3 text-sm text-zinc-700 resize-none focus:outline-none rounded-b-lg"
        rows={4}
      />
    </div>
  )
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
)

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false)
  const [dashEquipment, setDashEquipment] = useState<any[]>([])
  const [dashSuppliers, setDashSuppliers] = useState<any[]>([])
  const [dashClients, setDashClients] = useState<any[]>([])
  const [now] = useState(() => new Date())
  const toKST = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10)
  const today = toKST(now)
  const yesterday = toKST(new Date(now.getTime() - 86400000))
  const monthStart = today.slice(0, 7) + '-01'

  const prevMonthStart = (() => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10) })()
  const [kpi, setKpi] = useState({ todayCount: 0, yesterdayCount: 0, monthRevenue: 0, prevMonthRevenue: 0, unpaid: 0, invoiced: 0, notInvoiced: 0 })
  const [equipPie, setEquipPie] = useState<any[]>([])
  const [bankBalance, setBankBalance] = useState<number | null>(null)
  const [bankBalanceDate, setBankBalanceDate] = useState<string>('')
  const [monthExpenses, setMonthExpenses] = useState<number>(0)
  const [todayDispatches, setTodayDispatches] = useState<any[]>([])
  const [ownEquipmentPlateNos, setOwnEquipmentPlateNos] = useState<string[]>([])
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [inspectionAlert, setInspectionAlert] = useState<any[]>([])
  const [vat, setVat] = useState<any>(null)
  const [vatKey, setVatKey] = useState<string>('')
  const [unpaidInvoiceAmt, setUnpaidInvoiceAmt] = useState<number>(0)
  const [profitYear, setProfitYear] = useState<number>(new Date().getFullYear())
  const [profitData, setProfitData] = useState<{totalDispatch:number,totalExpenses:number,profit:number,profitRate:number,plate002Amt:number,jeiaAmt:number,fuelAmt:number,fuelRate:number,categoryBreakdown:{category:string,amount:number}[]}|null>(null)
  const [weather, setWeather] = useState<{temp:number,code:number,wind:number}|null>(null)

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=36.6424&longitude=127.4890&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FSeoul')
      .then(r => r.json())
      .then(d => {
        const c = d.current
        if (c) setWeather({ temp: Math.round(c.temperature_2m), code: c.weather_code, wind: Math.round(c.wind_speed_10m) })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const prevMonthEnd  = (() => { const d = new Date(today); d.setDate(0); return d.toISOString().slice(0,10) })()
      const last7 = Array.from({length:7},(_,i) => toKST(new Date(Date.now()-(6-i)*86400000)))

      const now2 = new Date(); const vy2 = now2.getFullYear(); const vm2 = now2.getMonth()+1
      const curPeriod = vm2<=3?`${vy2}-1기예정`:vm2<=6?`${vy2}-1기확정`:vm2<=9?`${vy2}-2기예정`:`${vy2}-2기확정`
      const prevPeriod = vm2<=3?`${vy2-1}-2기확정`:vm2<=6?`${vy2}-1기예정`:vm2<=9?`${vy2}-1기확정`:`${vy2}-2기예정`

      const [
        {data:todayLogs}, {data:yesterdayLogs},
        {data:monthLogs}, {data:prevMonthLogs},
        {data:weekLogs},  {data:equipment},
        {data:dispatches},{data:recentLogsRaw},
        {data:alertEq},
        {data:vatPayments},
        {data:salesInvoices},
        {data:purchaseInvoices},
        {data:prevMonthInvoiceLogs},
        {data:lastBankTx},
        {data:monthExpenseRows},
      ] = await Promise.all([
        supabase.from('daily_logs').select('id').eq('log_date', today),
        supabase.from('daily_logs').select('id').eq('log_date', yesterday),
        supabase.from('daily_logs').select('quantity,dispatch:dispatches(client_unit_price)').gte('log_date',monthStart).lte('log_date',today),
        supabase.from('daily_logs').select('quantity,dispatch:dispatches(client_unit_price)').gte('log_date',prevMonthStart).lte('log_date',prevMonthEnd),
        supabase.from('daily_logs').select('log_date,is_paid,quantity,dispatch:dispatches(client_unit_price)').gte('log_date',last7[0]).lte('log_date',today),
        supabase.from('equipment').select('type,status,plate_no,ownership'),
        supabase.from('dispatches').select('*,equipment:equipment(type,plate_no,ownership),supplier:suppliers(name)').gte('start_date',today).lte('start_date',today),
        supabase.from('daily_logs').select('*,dispatch:dispatches(site_name,client_name,driver_name,equipment_text,equipment:equipment(type,plate_no))').order('log_date',{ascending:false}).limit(5),
        supabase.from('equipment').select('plate_no,type,inspection_expire').not('inspection_expire','is',null),
        supabase.from('vat_payments').select('*').in('period', [curPeriod, prevPeriod]),
        supabase.from('invoices').select('issue_date,vat_amount,total_amount,status'),
        supabase.from('purchase_invoices').select('issue_date,vat_amount'),
        supabase.from('daily_logs').select('invoice_issued,quantity,work_price_1,work_price_2,work_time_1,work_time_2,dispatch:dispatches(client_unit_price)').gte('log_date',prevMonthStart).lte('log_date',prevMonthEnd),
        supabase.from('bank_transactions').select('balance,transaction_at').order('transaction_at',{ascending:false}).limit(1),
        supabase.from('expenses').select('amount').gte('expense_date',monthStart).lte('expense_date',today),
      ])

      const rev = (r:any[]) => r.reduce((s,l) => s+Math.round((l.quantity??0)*(l.dispatch?.client_unit_price??0)),0)
      const unpaidAmt = (weekLogs??[]).filter((l:any)=>!l.is_paid).reduce((s:number,l:any)=>s+Math.round((l.quantity??0)*(l.dispatch?.client_unit_price??0)),0)
      const parseH = (slot:string|null) => { if(!slot) return 0; const m=slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/); if(!m) return 0; return Math.max(0,(Number(m[3])*60+Number(m[4])-Number(m[1])*60-Number(m[2]))/60) }
      const calcLogAmt = (l:any) => { const p1=Number(l.work_price_1)||0; const p2=Number(l.work_price_2)||0; const slotAmt=Math.round(parseH(l.work_time_1)*p1+parseH(l.work_time_2)*p2); return slotAmt||Math.round((l.quantity??0)*(l.dispatch?.client_unit_price??0)) }
      const invoicedAmt = (prevMonthInvoiceLogs??[]).filter((l:any)=>l.invoice_issued).reduce((s:number,l:any)=>s+calcLogAmt(l),0)
      const unpaidInvoiceAmt = (salesInvoices??[]).filter((r:any)=>r.status==='issued').reduce((s:number,r:any)=>s+(r.total_amount??0),0)
      setUnpaidInvoiceAmt(unpaidInvoiceAmt)
      const notInvoicedAmt = (prevMonthInvoiceLogs??[]).filter((l:any)=>!l.invoice_issued).reduce((s:number,l:any)=>s+calcLogAmt(l),0)
      setKpi({ todayCount:todayLogs?.length??0, yesterdayCount:yesterdayLogs?.length??0, monthRevenue:rev(monthLogs??[]), prevMonthRevenue:rev(prevMonthLogs??[]), unpaid:unpaidAmt, invoiced:invoicedAmt, notInvoiced:notInvoicedAmt })

      const lastTx = (lastBankTx??[])[0]
      setBankBalance(lastTx?.balance ?? null)
      setBankBalanceDate(lastTx?.transaction_at?.slice(0,10) ?? '')
      setMonthExpenses((monthExpenseRows??[]).reduce((s:number,e:any)=>s+(e.amount??0),0))

      const byType:Record<string,number>={}
      const tl:Record<string,string>={excavator:'굴삭기',dump:'덤프',cargo:'화물차',truck:'화물차'}
      for (const e of (equipment??[])) { const k=tl[e.type]??e.type??'기타'; byType[k]=(byType[k]??0)+1 }
      setEquipPie(Object.entries(byType).map(([name,value])=>({name,value})))
      setOwnEquipmentPlateNos((equipment??[]).filter((e:any)=>e.ownership === 'own' && e.plate_no).map((e:any)=>e.plate_no))

      setTodayDispatches(dispatches??[])
      setRecentLogs(recentLogsRaw??[])

      const alertDate=new Date(Date.now()+60*86400000).toISOString().slice(0,10)
      setInspectionAlert((alertEq??[]).filter((e:any)=>{ if(!e.inspection_expire) return false; const d=new Date(e.inspection_expire); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10)<=alertDate }))
      // VAT: 이전 기간 납부 완료 여부에 따라 표시 기간 결정
      const prevPaid = (vatPayments??[]).find((v:any) => v.period === prevPeriod)
      const ck2 = prevPaid ? curPeriod : prevPeriod
      setVatKey(ck2)
      const found = (vatPayments??[]).find((v:any) => v.period === ck2) ?? null
      if (found) {
        setVat(found)
      } else {
        // 기간에 맞는 날짜 범위 계산
        const periodRanges: Record<string,[string,string]> = {
          [`${vy2}-1기예정`]: [`${vy2}-01-01`,`${vy2}-03-31`],
          [`${vy2}-1기확정`]: [`${vy2}-01-01`,`${vy2}-06-30`],
          [`${vy2}-2기예정`]: [`${vy2}-07-01`,`${vy2}-09-30`],
          [`${vy2}-2기확정`]: [`${vy2}-07-01`,`${vy2}-12-31`],
          [`${vy2-1}-2기확정`]: [`${vy2-1}-07-01`,`${vy2-1}-12-31`],
        }
        const [vatPeriodStart, vatPeriodEnd] = periodRanges[ck2] ?? [`${vy2}-01-01`,`${vy2}-12-31`]
        const salesVat = (salesInvoices??[]).filter((r:any)=>r.issue_date>=vatPeriodStart&&r.issue_date<=vatPeriodEnd).reduce((s:number,r:any)=>s+(r.vat_amount??0),0)
        const purchaseVat = (purchaseInvoices??[]).filter((r:any)=>r.issue_date>=vatPeriodStart&&r.issue_date<=vatPeriodEnd).reduce((s:number,r:any)=>s+(r.vat_amount??0),0)
        setVat({ period: ck2, sales_vat: salesVat, purchase_vat: purchaseVat, net_vat: salesVat - purchaseVat })
      }

      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    supabase.from('equipment').select('*, supplier:suppliers(*)').then(({ data }: { data: any[] | null }) => setDashEquipment(data ?? []))
    supabase.from('suppliers').select('*').then(({ data }: { data: any[] | null }) => setDashSuppliers(data ?? []))
    supabase.from('clients').select('*').then(({ data }: { data: any[] | null }) => setDashClients(data ?? []))
  }, [])

  useEffect(() => {
    async function loadProfit() {
      const yearStart = `${profitYear}-01-01`
      const yearEnd = `${profitYear}-12-31`
      const [
        { data: yearDispatches },
        { data: yearExpenses },
        { data: plate002Dispatches },
        { data: jeiaDispatches },
      ] = await Promise.all([
        // 이영규 차주 배차건만 (driver_name 필터)
        supabase.from('dispatches')
          .select('client_unit_price, daily_logs(quantity,work_price_1,work_price_2,work_price_3,work_time_1,work_time_2,work_time_3,engineer_daily_wage)')
          .eq('driver_name', '이영규')
          .gte('start_date', yearStart)
          .lte('start_date', yearEnd),
        supabase.from('expenses').select('amount,category').gte('expense_date', yearStart).lte('expense_date', yearEnd),
        // 002어6110 차량 배차 합계
        supabase.from('dispatches')
          .select('client_unit_price, equipment:equipment(plate_no), equipment_text, daily_logs(quantity,work_price_1,work_price_2,work_price_3,work_time_1,work_time_2,work_time_3)')
          .gte('start_date', yearStart)
          .lte('start_date', yearEnd),
        // (주)제이에이건설 배차 합계
        supabase.from('dispatches')
          .select('client_unit_price, daily_logs(quantity,work_price_1,work_price_2,work_price_3,work_time_1,work_time_2,work_time_3)')
          .ilike('client_name', '%제이에이건설%')
          .gte('start_date', yearStart)
          .lte('start_date', yearEnd),
      ])
      const parseH = (slot:string|null) => {
        if(!slot) return 0
        const m=slot.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/)
        if(!m) return 0
        return Math.max(0,(Number(m[3])*60+Number(m[4])-Number(m[1])*60-Number(m[2]))/60)
      }
      let totalDispatch = 0
      for (const d of (yearDispatches??[])) {
        const log = (d.daily_logs as any[]|null)?.[0]
        if (!log) continue
        const qty = log.quantity ?? 0
        const p1=Number(log.work_price_1)||0, p2=Number(log.work_price_2)||0, p3=Number(log.work_price_3)||0
        const slotAmt =
          (log.work_time_1?Math.round(parseH(log.work_time_1)*p1):0)+
          (log.work_time_2?Math.round(parseH(log.work_time_2)*p2):0)+
          (log.work_time_3?Math.round(parseH(log.work_time_3)*p3):0)
        totalDispatch += slotAmt || Math.round(qty*(d.client_unit_price??0)) || (log.engineer_daily_wage??0)
      }
      const totalExpenses = (yearExpenses??[]).reduce((s:number,e:any)=>s+(e.amount??0),0)
      const profit = totalDispatch - totalExpenses
      const profitRate = totalDispatch > 0 ? profit / totalDispatch * 100 : 0

      // 002어6110 합계 (equipment.plate_no 또는 equipment_text 기준)
      let plate002Amt = 0
      for (const d of (plate002Dispatches??[])) {
        const plateNo = (d.equipment as any)?.plate_no ?? ''
        const eqText = (d as any).equipment_text ?? ''
        if (!plateNo.includes('002어6110') && !eqText.includes('002어6110')) continue
        const log = (d.daily_logs as any[]|null)?.[0]
        if (!log) continue
        const qty = log.quantity ?? 0
        const p1=Number(log.work_price_1)||0,p2=Number(log.work_price_2)||0,p3=Number(log.work_price_3)||0
        const slotAmt=(log.work_time_1?Math.round(parseH(log.work_time_1)*p1):0)+(log.work_time_2?Math.round(parseH(log.work_time_2)*p2):0)+(log.work_time_3?Math.round(parseH(log.work_time_3)*p3):0)
        plate002Amt += slotAmt || Math.round(qty*(d.client_unit_price??0))
      }

      // (주)제이에이건설 합계
      let jeiaAmt = 0
      for (const d of (jeiaDispatches??[])) {
        const log = (d.daily_logs as any[]|null)?.[0]
        if (!log) continue
        const qty = log.quantity ?? 0
        const p1=Number(log.work_price_1)||0,p2=Number(log.work_price_2)||0,p3=Number(log.work_price_3)||0
        const slotAmt=(log.work_time_1?Math.round(parseH(log.work_time_1)*p1):0)+(log.work_time_2?Math.round(parseH(log.work_time_2)*p2):0)+(log.work_time_3?Math.round(parseH(log.work_time_3)*p3):0)
        jeiaAmt += slotAmt || Math.round(qty*(d.client_unit_price??0))
      }

      const fuelAmt = (yearExpenses??[]).filter((e:any)=>(e.category??'').includes('주유')).reduce((s:number,e:any)=>s+(e.amount??0),0)
      const fuelRate = totalDispatch > 0 ? fuelAmt / totalDispatch * 100 : 0
      const catMap: Record<string,number> = {}
      for (const e of (yearExpenses??[])) {
        const cat = e.category ?? '기타'
        catMap[cat] = (catMap[cat]??0) + (e.amount??0)
      }
      const categoryBreakdown = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([category,amount])=>({category,amount}))
      setProfitData({ totalDispatch, totalExpenses, profit, profitRate, plate002Amt, jeiaAmt, fuelAmt, fuelRate, categoryBreakdown })
    }
    loadProfit()
  }, [profitYear])

  function weatherIcon(code: number) {
    if (code === 0) return '☀️'
    if (code <= 3) return '⛅'
    if (code <= 48) return '🌫️'
    if (code <= 55) return '🌦️'
    if (code <= 67) return '🌧️'
    if (code <= 77) return '❄️'
    if (code <= 82) return '🌦️'
    return '⛈️'
  }
  function weatherLabel(code: number) {
    if (code === 0) return '맑음'
    if (code <= 3) return '구름조금'
    if (code <= 48) return '안개'
    if (code <= 55) return '이슬비'
    if (code <= 67) return '비'
    if (code <= 77) return '눈'
    if (code <= 82) return '소나기'
    return '천둥번개'
  }

  const tl:Record<string,string>={excavator:'굴삭기',dump:'덤프',cargo:'화물차',truck:'화물차'}
  const todayDiff = kpi.todayCount - kpi.yesterdayCount
  const revDiff = kpi.prevMonthRevenue>0 ? Math.round((kpi.monthRevenue-kpi.prevMonthRevenue)/kpi.prevMonthRevenue*100) : 0
  const normalizePlate = (value: string) => value.replace(/\s/g, '')
  const ownEquipmentPlates = new Set(ownEquipmentPlateNos.map(normalizePlate))
  const dispatchPlateOf = (d:any) => d.equipment?.plate_no ?? (d.equipment_text ?? '').trim().split(/\s+/).pop() ?? ''
  const ownTodayDispatches = todayDispatches.filter((d:any) => {
    if (d.equipment?.ownership === 'own') return true
    const plate = normalizePlate(dispatchPlateOf(d))
    return plate && ownEquipmentPlates.has(plate)
  })
  const otherTodayDispatchCount = Math.max(todayDispatches.length - ownTodayDispatches.length, 0)
  const ownTodayPreview = ownTodayDispatches.slice(0, 3)
  const plateOf = (d:any) => dispatchPlateOf(d) || '-'

  return (
    <div className="min-h-full bg-[#f3f0ea] p-3 md:p-5">
      <div className="mb-5 flex flex-col gap-5 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-5 text-white shadow-xl md:flex-row md:items-end md:justify-between md:p-6">
        <div>
          <p className="text-xs font-semibold uppercase text-amber-300">Operations Dashboard</p>
          <div className="mt-1 flex items-center gap-4 flex-wrap">
            <h1 className="text-3xl font-bold text-white">안녕하세요, 관리자님!</h1>
            <button onClick={() => setDispatchModalOpen(true)} className="rounded-xl bg-amber-400 px-5 py-2.5 text-base font-bold text-zinc-950 hover:bg-amber-300 transition-colors">+ 배차 등록</button>
          </div>
          <p className="mt-2 text-sm text-zinc-300">오늘 배차, 자금, 세금 상태를 한 화면에서 확인하세요.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-300 flex-wrap">
          {weather && (
            <div className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2">
              <span className="text-lg leading-none">{weatherIcon(weather.code)}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-base font-bold text-white">{weather.temp}°C</span>
                <span className="text-[10px] text-zinc-400">청주 · {weatherLabel(weather.code)}</span>
              </div>
            </div>
          )}
          <span className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-medium text-zinc-100">{today}</span>
        </div>
      </div>

      {/* 메모장 */}
      <MemoWidget />

      {/* 연간 이윤 분석 */}
      <Card className="mb-5 overflow-hidden border-zinc-800 bg-zinc-950 text-white shadow-xl">
        <div className="border-b border-zinc-800 bg-zinc-900 px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">연간 이윤 분석</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-300">기준 연도</span>
            <select value={profitYear} onChange={e => setProfitYear(Number(e.target.value))}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-300">
              {[2023,2024,2025,2026,2027].map(y=>(
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
        </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 text-xs font-semibold text-zinc-200">총 매출금액</p>
            <p className="text-lg font-bold text-white">{profitData ? profitData.totalDispatch.toLocaleString()+' 원' : '-'}</p>
            {profitData && profitData.fuelAmt > 0 && (
              <div className="mt-2 border-t border-zinc-800 pt-2">
                <p className="text-xs text-zinc-300">유류비 {profitData.fuelAmt.toLocaleString()}원</p>
                <p className="text-xs font-semibold text-amber-300">매출 대비 {profitData.fuelRate.toFixed(1)}%</p>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 text-xs font-semibold text-zinc-200">법인관리비</p>
            <p className="text-lg font-bold text-red-400">{profitData ? '-'+profitData.totalExpenses.toLocaleString()+' 원' : '-'}</p>
            {profitData && profitData.categoryBreakdown.length > 0 && (
              <div className="mt-2 border-t border-zinc-800 pt-2 space-y-1">
                {profitData.categoryBreakdown.map(c=>(
                  <div key={c.category} className="flex justify-between text-xs font-medium">
                    <span className="text-zinc-300">{c.category}</span>
                    <span className="text-zinc-100">{c.amount.toLocaleString()}원</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 text-xs font-semibold text-zinc-200">현재 이윤 (관리비 포함)</p>
            <p className={`text-lg font-bold ${profitData&&profitData.profit>=0?'text-emerald-400':'text-red-400'}`}>
              {profitData ? (profitData.profit>=0?'+':'')+profitData.profit.toLocaleString()+' 원' : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <p className="mb-2 text-xs font-semibold text-zinc-200">평균 이윤율</p>
            <p className={`text-2xl font-bold ${profitData&&profitData.profitRate>=0?'text-emerald-400':'text-red-400'}`}>
              {profitData ? profitData.profitRate.toFixed(1)+'%' : '-'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-2">
          <div className="rounded-lg border border-amber-300 bg-amber-100 p-4">
            <p className="mb-2 text-xs font-semibold text-zinc-700">002어6110 배차 합계</p>
            <p className="text-lg font-bold text-zinc-950">{profitData ? profitData.plate002Amt.toLocaleString()+' 원' : '-'}</p>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-100 p-4">
            <p className="mb-2 text-xs font-semibold text-zinc-700">(주)제이에이건설 배차 합계</p>
            <p className="text-lg font-bold text-zinc-950">{profitData ? profitData.jeiaAmt.toLocaleString()+' 원' : '-'}</p>
          </div>
        </div>
      </Card>

      {/* KPI */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <Card className="border border-zinc-800 bg-zinc-950 p-5 text-white shadow-lg">
          <p className="mb-3 text-xs font-semibold text-zinc-200">오늘 배차 건수</p>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-300/20 text-lg">🚜</div>
            <p className="text-2xl font-bold text-white">{kpi.todayCount}건</p>
          </div>
          <p className={`text-xs ${todayDiff>0?'text-emerald-300':todayDiff<0?'text-red-300':'text-zinc-300'}`}>
            {todayDiff!==0 ? `전일 대비 ${todayDiff>0?'▲':'▼'} ${Math.abs(todayDiff)}건` : '전일과 동일'}
          </p>
          <div className="mt-4 border-t border-zinc-800 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-amber-200">우리 장비(자차)</span>
              <span className="font-bold text-white">{ownTodayDispatches.length}건</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-zinc-400">
              <span>타사 장비</span>
              <span>{otherTodayDispatchCount}건</span>
            </div>
            {ownTodayPreview.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ownTodayPreview.map((d:any) => (
                  <span key={d.id} className="rounded-md bg-amber-300/15 px-2 py-1 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-300/30">
                    {plateOf(d)} · {d.site_name ?? '-'}
                  </span>
                ))}
                {ownTodayDispatches.length > ownTodayPreview.length && (
                  <span className="rounded-md bg-zinc-800 px-2 py-1 text-[11px] font-semibold text-zinc-300">
                    +{ownTodayDispatches.length - ownTodayPreview.length}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-500">오늘 자차 배차 없음</p>
            )}
          </div>
        </Card>

        <Card className="border border-red-200 bg-white p-5 shadow-lg">
          <p className="mb-3 text-xs font-semibold text-zinc-700">현재 미수금 (매출계산서)</p>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-lg">💰</div>
            <p className="text-2xl font-bold text-zinc-950">{Math.round(unpaidInvoiceAmt/10000).toLocaleString()}만원</p>
          </div>
          <p className="text-xs font-medium text-red-600">{unpaidInvoiceAmt.toLocaleString()}원</p>
        </Card>

        <Card className="border border-amber-300 bg-amber-100 p-5 text-zinc-950 shadow-lg">
          <p className="mb-3 text-xs font-semibold text-zinc-700">전월 청구현황 ({prevMonthStart.slice(0,7)})</p>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70 text-lg">📋</div>
            <p className="text-2xl font-bold text-zinc-950">청구완료 {Math.round(kpi.invoiced/10000).toLocaleString()}만원</p>
          </div>
          <p className="text-xs font-semibold text-amber-800">미청구 {Math.round(kpi.notInvoiced/10000).toLocaleString()}만원</p>
        </Card>
      </div>
      {/* 통장잔액 + 당월관리비 */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="overflow-hidden border-0 bg-white shadow-lg">
          <div className="border-b border-zinc-100 bg-zinc-950 px-5 py-3">
            <p className="text-xs font-semibold text-zinc-300">통장 잔액{bankBalanceDate && <span className="ml-1 text-zinc-500">({bankBalanceDate} 기준)</span>}</p>
          </div>
          <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-2xl">🏦</div>
            <p className="text-3xl font-bold text-zinc-950">
              {bankBalance !== null ? bankBalance.toLocaleString() + '원' : '데이터 없음'}
            </p>
          </div>
          <p className="mt-3 text-xs text-zinc-500">최근 입출금내역 기준 잔액 · <a href="/dashboard/bank" className="font-semibold text-zinc-950 hover:underline">통장내역 보기 →</a></p>
          </div>
        </Card>
        <Card className="overflow-hidden border-0 bg-white shadow-lg">
          <div className="border-b border-red-100 bg-red-950 px-5 py-3">
            <p className="text-xs font-semibold text-red-100">당월 관리비 지출 <span className="text-red-200">({monthStart.slice(0,7)})</span></p>
          </div>
          <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-red-100 text-2xl">💸</div>
            <p className="text-3xl font-bold text-red-600">
              {Math.round(monthExpenses/10000).toLocaleString()}만원
            </p>
          </div>
          <p className="mt-3 text-xs text-zinc-500">{monthExpenses.toLocaleString()}원 · <a href="/dashboard/expenses" className="font-semibold text-red-700 hover:underline">지출내역 보기 →</a></p>
          </div>
        </Card>
      </div>

      {/* 최근 내역 + 검사 알림 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="overflow-hidden border-0 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-white px-5 py-4">
            <p className="text-sm font-bold text-zinc-950">최근 배차 내역</p>
            <a href="/dashboard/daily-logs" className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800">전체보기 →</a>
          </div>
          <div className="p-4">
          {loading ? <div className="py-4 text-center text-sm text-zinc-500">불러오는 중...</div>
          : recentLogs.length===0 ? <div className="py-4 text-center text-sm text-zinc-500">데이터 없음</div>
          : <div className="space-y-2">
            {recentLogs.map((l:any)=>(
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-[#faf8f3] px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{l.dispatch?.equipment?.type==='excavator'?'🚜':l.dispatch?.equipment?.type==='dump'?'🚛':'🚚'}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{l.dispatch?.equipment?.plate_no ?? (l.dispatch?.equipment_text ?? '').split(/\s+/).pop() ?? '-'}</p>
                    <p className="text-xs text-zinc-500">{l.dispatch?.site_name??'-'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">{l.log_date}</p>
                  <span className="rounded-lg bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-700">완료</span>
                </div>
              </div>
            ))}
          </div>}
          </div>
        </Card>

        <Card className="overflow-hidden border-0 bg-amber-50 shadow-lg">
          <div className="flex items-center justify-between bg-amber-400 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <p className="text-base font-bold text-zinc-950">정기검사 만료 임박</p>
            </div>
            <span className="rounded-lg bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-amber-200">60일 이내</span>
          </div>
          <div className="p-4">
          {loading ? <div className="py-4 text-center text-sm text-zinc-500">불러오는 중...</div>
          : inspectionAlert.length===0
            ? <div className="py-6 text-center"><p className="mb-1 text-2xl">✅</p><p className="text-sm text-zinc-500">만료 임박 장비 없음</p></div>
            : <div className="space-y-2">
              {inspectionAlert.slice(0,5).map((e:any,i:number)=>{
                const d=new Date(e.inspection_expire); d.setDate(d.getDate()+30)
                const days=Math.ceil((d.getTime()-now.getTime())/86400000)
                return (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-amber-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🔧</span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">{e.plate_no}</p>
                        <p className="text-xs text-zinc-500">{tl[e.type]??e.type}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold px-3 py-1 rounded-full ${days<=14?'bg-red-100 text-red-700':days<=30?'bg-amber-100 text-amber-700':'bg-yellow-100 text-yellow-700'}`}>D-{days}</span>
                  </div>
                )
              })}
            </div>}
          </div>
        </Card>
      </div>

      {/* 부가세 */}
      {!loading && vat && (() => {
        const vy = parseInt(vatKey.slice(0,4))
        const periodMap: Record<string,{label:string;deadline:string}> = {
          [`${vy}-1기예정`]:{label:`${vy}년 1기 예정`,deadline:`${vy}-04-25`},
          [`${vy}-1기확정`]:{label:`${vy}년 1기 확정`,deadline:`${vy}-07-25`},
          [`${vy}-2기예정`]:{label:`${vy}년 2기 예정`,deadline:`${vy}-10-25`},
          [`${vy}-2기확정`]:{label:`${vy}년 2기 확정`,deadline:`${String(vy+1)}-01-25`},
        }
        const info = periodMap[vatKey] ?? {label:vatKey,deadline:''}
        const net = vat.net_vat ?? 0
        const deadline = info.deadline
        const daysLeft = deadline ? Math.ceil((new Date(deadline).getTime()-now.getTime())/86400000) : null
        return (
          <Card className="mt-4 overflow-hidden border-0 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-5 py-4">
              <p className="text-base font-bold text-amber-300">🏛 <span className="text-white">{vatKey.slice(0,4)}</span>년 <span className="text-white">{(vatKey.match(/(\d+)기/)||[])[1]??''}</span>기 {vatKey.includes('예정')?'예정':'확정'} 부가세</p>
              {deadline && daysLeft !== null && (
                <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${daysLeft <= 30 ? 'bg-red-500 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
                  신고기한 {deadline} (D-{daysLeft})
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 p-5">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-zinc-500">매출세액</p>
                <p className="text-xl font-bold text-blue-700">{(vat.sales_vat ?? 0).toLocaleString()}원</p>
              </div>
              <div className="rounded-lg bg-orange-50 p-3">
                <p className="text-xs text-zinc-500">매입세액</p>
                <p className="text-xl font-bold text-orange-600">{(vat.purchase_vat ?? 0).toLocaleString()}원</p>
              </div>
              <div className={`col-span-2 rounded-lg p-3 ${net >= 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className="text-xs text-zinc-500">{net >= 0 ? '납부세액 (내야 할 세금)' : '환급세액 (돌려받을 세금)'}</p>
                <p className={`text-2xl font-bold ${net >= 0 ? 'text-red-600' : 'text-green-600'}`}>{Math.abs(net).toLocaleString()}원</p>
              </div>
            </div>
          </Card>
        )
      })()}
      {dispatchModalOpen && (
        <LogModal
          log={null}
          dispatches={[]}
          equipment={dashEquipment}
          suppliers={dashSuppliers}
          clients={dashClients}
          onClose={() => setDispatchModalOpen(false)}
          onSaved={() => setDispatchModalOpen(false)}
        />
      )}
    </div>
  )
}