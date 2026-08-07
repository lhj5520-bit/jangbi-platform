'use client'

import React from 'react'

export type PageAction = {
  label: string
  onClick: () => void
  /** 모바일에서 숨김 (인쇄 등 데스크탑 전용 기능) */
  desktopOnly?: boolean
  disabled?: boolean
}

/**
 * 목록 화면 공용 헤더.
 *
 * - 데스크탑: 제목 + 보조 액션(중립 아웃라인) + 주요 액션(파란 솔리드)
 * - 모바일: 상단 앱 헤더가 이미 페이지명을 보여주므로 제목은 숨기고,
 *   보조 액션만 가로 스크롤 칩으로 노출. 주요 액션은 화면 우하단 FAB.
 */
export default function PageHeader({
  title,
  subtitle,
  primary,
  secondary = [],
  children,
}: {
  title: string
  subtitle?: string
  primary?: PageAction
  secondary?: PageAction[]
  children?: React.ReactNode
}) {
  const mobileSecondary = secondary.filter(a => !a.desktopOnly)

  return (
    <>
      <div className="mb-4 md:mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {/* 모바일 상단 헤더에 이미 페이지명이 있어 중복 표시하지 않음 */}
            <h1 className="hidden md:block text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-xs md:text-sm text-gray-500 md:mt-1">{subtitle}</p>}
          </div>

          {/* 데스크탑 액션 */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {secondary.map(a => (
              <button
                key={a.label}
                onClick={a.onClick}
                disabled={a.disabled}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
            {primary && (
              <button
                onClick={primary.onClick}
                disabled={primary.disabled}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {primary.label}
              </button>
            )}
          </div>
        </div>

        {/* 모바일 보조 액션 */}
        {mobileSecondary.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
            {mobileSecondary.map(a => (
              <button
                key={a.label}
                onClick={a.onClick}
                disabled={a.disabled}
                className="shrink-0 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {children}
      </div>

      {/* 모바일 주요 액션 (FAB) — 목록을 길게 스크롤해도 항상 닿는 위치 */}
      {primary && (
        <button
          onClick={primary.onClick}
          disabled={primary.disabled}
          aria-label={primary.label}
          className="fixed right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-5 text-base font-bold text-white shadow-lg shadow-blue-600/30 active:bg-blue-700 disabled:opacity-50 md:hidden print:hidden"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {primary.label}
        </button>
      )}
    </>
  )
}
