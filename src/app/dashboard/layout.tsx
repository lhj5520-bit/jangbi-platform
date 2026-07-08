'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const ExcavatorIcon = () => (
  <svg width={22} height={22} viewBox="0 0 64 64" fill="currentColor" style={{ display: 'inline-block' }}>
    <rect x="4" y="44" width="56" height="12" rx="4" opacity="0.5"/>
    <rect x="8" y="40" width="12" height="6" rx="2"/>
    <rect x="24" y="40" width="28" height="6" rx="2"/>
    <path d="M36 14 L52 28 L44 36 L20 36 L20 28 L30 20 Z"/>
    <rect x="12" y="24" width="10" height="16" rx="2"/>
    <path d="M52 28 L60 32 L58 38 L44 36 Z" opacity="0.7"/>
  </svg>
)

const I = (p: React.SVGProps<SVGSVGElement>) => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p} />
)

const Icons: Record<string, () => React.ReactElement> = {
  dashboard: () => <I><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></I>,
  clients:   () => <I><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></I>,
  suppliers: () => <I><path d="M3 3h18v4H3z"/><path d="M3 7v13h18V7"/><path d="M9 7v13"/><path d="M15 7v13"/></I>,
  excavator: ExcavatorIcon,
  dispatch:  () => <I><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></I>,
  ledger:    () => <I><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></I>,
  statement: () => <I><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></I>,
  invoice:   () => <I><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></I>,
  purchase:  () => <I><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></I>,
  vat:       () => <I><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></I>,
  bank:      () => <I><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="6.01" y2="15"/><line x1="10" y1="15" x2="14" y2="15"/></I>,
  expenses:  () => <I><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></I>,
}

type NavItem = { href: string; label: string; icon: string | null; customIcon?: () => React.ReactElement }
const navItems: NavItem[] = [
  { href: '/dashboard',                  label: '대시보드',           icon: 'dashboard' },
  { href: '/dashboard/clients',          label: '발주처',             icon: 'clients' },
  { href: '/dashboard/suppliers',        label: '중기업체',           icon: 'suppliers' },
  { href: '/dashboard/equipment-own',    label: '장비(자차)',          icon: null, customIcon: ExcavatorIcon },
  { href: '/dashboard/equipment-other',  label: '장비(타사)',          icon: null, customIcon: ExcavatorIcon },
  { href: '/dashboard/daily-logs',       label: '작업확인서출력',      icon: 'ledger' },
  { href: '/dashboard/dispatch-ledger',  label: '배차내역서',          icon: 'statement' },
  { href: '/dashboard/trade-statement',  label: '거래명세서',          icon: 'invoice' },
  { href: '/dashboard/estimate',         label: '견적서',              icon: 'invoice' },
  { href: '/dashboard/rental-contract', label: '임대차계약서',         icon: 'ledger' },
  { href: '/dashboard/invoices',         label: '매출계산서',          icon: 'invoice' },
  { href: '/dashboard/purchase-invoices',label: '매입계산서',          icon: 'purchase' },
  { href: '/dashboard/vat',              label: '부가세',              icon: 'vat' },
  { href: '/dashboard/bank',             label: '통장내역',            icon: 'bank' },
  { href: '/dashboard/expenses',         label: '관리비',              icon: 'expenses' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [allowedPaths, setAllowedPaths] = useState<string[] | null>(null) // null = 관리자(전체)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: perm } = await supabase.from('user_permissions').select('*').eq('user_id', data.user.id).single()
      // 레코드 없거나 is_admin=true → 전체 접근 (관리자)
      // 레코드 있고 is_admin=false → allowed_paths만 접근
      if (!perm || perm.is_admin) setAllowedPaths(null)
      else setAllowedPaths(perm.allowed_paths ?? [])
    })
  }, [])

  // 모바일 뒤로가기 → 메뉴 열기
  useEffect(() => {
    window.history.pushState({ menuGuard: true }, '')

    function handlePop() {
      window.history.pushState({ menuGuard: true }, '')
      // 모달 열려있으면 모달 닫기, 없으면 사이드바 열기
      const cancelled = !document.dispatchEvent(
        new CustomEvent('swipe-back', { cancelable: true })
      )
      if (!cancelled) setDrawerOpen(true)
    }

    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [pathname])

  // 스와이프 오른쪽 → 메뉴 열기
  useEffect(() => {
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0
    let tracking = false

    function resetSwipe() {
      startX = 0
      startY = 0
      lastX = 0
      lastY = 0
      tracking = false
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        resetSwipe()
        return
      }
      const touch = e.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      lastX = touch.clientX
      lastY = touch.clientY
      tracking = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking || e.touches.length !== 1) return
      const touch = e.touches[0]
      lastX = touch.clientX
      lastY = touch.clientY
    }

    function onTouchEnd(e: TouchEvent) {
      if (!tracking) return
      const touch = e.changedTouches[0]
      const endX = touch?.clientX ?? lastX
      const endY = touch?.clientY ?? lastY
      const dx = endX - startX
      const dy = Math.abs(endY - startY)
      const horizontalSwipe = Math.abs(dx) >= 55 && Math.abs(dx) > dy * 1.25

      if (horizontalSwipe && dx > 0) {
        const cancelled = !document.dispatchEvent(
          new CustomEvent('swipe-back', { cancelable: true })
        )
        if (!cancelled) setDrawerOpen(true)
      }

      if (horizontalSwipe && dx < 0) {
        setDrawerOpen(false)
      }

      resetSwipe()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', resetSwipe, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', resetSwipe)
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const currentItem = navItems.find(i => i.href === pathname) ?? navItems[1]
  const mgmtHrefList = ['/dashboard/invoices', '/dashboard/purchase-invoices', '/dashboard/vat', '/dashboard/bank', '/dashboard/expenses']
  const [mgmtOpen, setMgmtOpen] = useState(false)
  useEffect(() => {
    if (mgmtHrefList.includes(pathname)) setMgmtOpen(true)
  }, [pathname])

  const managementHrefs = [
    '/dashboard/invoices',
    '/dashboard/purchase-invoices',
    '/dashboard/vat',
    '/dashboard/bank',
    '/dashboard/expenses',
  ]
  const canAccess = (href: string) => allowedPaths === null || allowedPaths.includes(href)
  const mainNavItems = navItems.filter(i => !managementHrefs.includes(i.href) && canAccess(i.href))
  const mgmtNavItems = navItems.filter(i => managementHrefs.includes(i.href) && canAccess(i.href))

  const renderNavIcon = (item: NavItem) => {
    if (item.customIcon) return <item.customIcon />
    if (item.icon && Icons[item.icon]) return React.createElement(Icons[item.icon])
    return item.icon
  }

  const renderNavLinks = (onNavigate?: () => void) => (
    <>
      <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">업무 메뉴</div>
      {mainNavItems.map(item => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'bg-zinc-900 text-amber-200 ring-1 ring-amber-400/30'
                : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
            }`}
          >
            {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-amber-400" />}
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
              isActive
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-zinc-900 text-zinc-400 group-hover:bg-zinc-800 group-hover:text-amber-200'
            }`}>
              {renderNavIcon(item)}
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}

      <div className="mx-3 my-3 h-px bg-zinc-800" />
      <button
        onClick={() => setMgmtOpen(v => !v)}
        className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900 text-zinc-400 group-hover:bg-zinc-800 group-hover:text-amber-200">
          <Icons.expenses />
        </span>
        <span className="flex-1 text-left">관리자메뉴</span>
        <span className="text-xs text-zinc-500">{mgmtOpen ? '▲' : '▼'}</span>
      </button>

      {mgmtOpen && (
        <div className="mt-1 ml-7 space-y-1 border-l border-zinc-800 pl-3">
          {mgmtNavItems.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-400 text-zinc-950'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center">{renderNavIcon(item)}</span>
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
          <Link href="/dashboard/sole-proprietor" onClick={onNavigate}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === '/dashboard/sole-proprietor'
                ? 'bg-amber-400 text-zinc-950'
                : 'text-amber-300 hover:bg-zinc-900 hover:text-amber-200'
            }`}>
            <span className="flex h-5 w-5 items-center justify-center"><Icons.invoice /></span>
            <span className="truncate">개인사업자관리</span>
          </Link>
          <Link href="/dashboard/export" onClick={onNavigate}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === '/dashboard/export'
                ? 'bg-amber-400 text-zinc-950'
                : 'text-emerald-300 hover:bg-zinc-900 hover:text-emerald-200'
            }`}>
            <span className="flex h-5 w-5 items-center justify-center"><Icons.ledger /></span>
            <span className="truncate">전체 내려받기</span>
          </Link>
          {allowedPaths === null && (
            <Link href="/dashboard/settings" onClick={onNavigate}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                pathname === '/dashboard/settings'
                  ? 'bg-amber-400 text-zinc-950'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
              }`}>
              <span className="flex h-5 w-5 items-center justify-center"><Icons.clients /></span>
              <span className="truncate">계정 설정</span>
            </Link>
          )}
        </div>
      )}
    </>
  )

  return (
    <div className="flex h-full">
      {/* 데스크탑 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-[#09090b] md:flex">
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4">
          <Image src="/icons/icon-192.png" alt="가온건설중기" width={38} height={38} className="rounded-xl ring-1 ring-zinc-700" />
          <div>
            <div className="text-sm font-bold leading-tight text-white">가온건설중기</div>
            <div className="text-xs text-zinc-400">장비 중개 관리</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {renderNavLinks()}
        </nav>
        <div className="border-t border-zinc-800 p-4">
          <button onClick={handleLogout}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white">
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일 드로어 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-zinc-950/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-[#09090b] shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div className="flex items-center gap-3">
                <Image src="/icons/icon-192.png" alt="가온건설중기" width={36} height={36} className="rounded-xl ring-1 ring-zinc-700" />
                <div>
                  <div className="text-sm font-bold leading-tight text-white">가온건설중기</div>
                  <div className="text-xs text-zinc-400">장비 중개 관리</div>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-2xl leading-none text-zinc-400">X</button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {renderNavLinks(() => setDrawerOpen(false))}
            </nav>
            <div className="border-t border-zinc-800 p-4">
              <button onClick={handleLogout}
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white">
                로그아웃
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 모바일 상단 헤더 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 md:hidden">
          <button onClick={() => setDrawerOpen(true)}
            className="p-1 text-2xl leading-none text-white">
            <span style={{display:'flex',flexDirection:'column',gap:'4px',width:'18px'}}>
              <span style={{height:'2px',background:'#ffffff',borderRadius:'1px',display:'block'}} />
              <span style={{height:'2px',background:'#ffffff',borderRadius:'1px',display:'block'}} />
              <span style={{height:'2px',background:'#ffffff',borderRadius:'1px',display:'block'}} />
            </span>
          </button>
          <Image src="/icons/icon-192.png" alt="로고" width={28} height={28} className="rounded-md" />
          <span className="flex items-center gap-1 text-base font-semibold text-white">
            {renderNavIcon(currentItem)} {currentItem.label}
          </span>
        </header>

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 overf
low-y-auto bg-[#f3f0ea]">
          {children}
        </main>
      </div>
    </div>
  )
}
