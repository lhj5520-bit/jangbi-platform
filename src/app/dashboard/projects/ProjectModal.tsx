'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Client } from '@/lib/types'

interface Props {
  project: Project | null
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}

export default function ProjectModal({ project, clients, onClose, onSaved }: Props) {
  const isEdit = !!project
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  // 스와이프 오른쪽 → 모달 닫기
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); onClose() }
    document.addEventListener('swipe-back', handler)
    return () => document.removeEventListener('swipe-back', handler)
  }, [onClose])
  const [form, setForm] = useState({
    client_id: project?.client_id ?? '',
    name: project?.name ?? '',
    location: project?.location ?? '',
    start_date: project?.start_date ?? '',
    end_date: project?.end_date ?? '',
    status: project?.status ?? 'active',
    memo: project?.memo ?? '',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.name) return alert('현장명을 입력해 주세요.')
    setSaving(true)
    if (isEdit) {
      await supabase.from('projects').update(form).eq('id', project.id)
    } else {
      await supabase.from('projects').insert(form)
    }
    setSaving(false)
    onSaved()
  }

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">{isEdit ? '현장 수정' : '현장 등록'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Row label="발주처">
            <select value={form.client_id} onChange={e => set('client_id', e.target.value)} className={inp}>
              <option value="">선택</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Row>
          <Row label="현장명 *">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={inp} placeholder="OO 아파트 신축공사" />
          </Row>
          <Row label="위치">
            <input value={form.location} onChange={e => set('location', e.target.value)}
              className={inp} placeholder="경기도 OO시 OO동" />
          </Row>
          <Row label="시작일">
            <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inp} />
          </Row>
          <Row label="종료일">
            <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inp} />
          </Row>
          <Row label="상태">
            <select value={form.status} onChange={e => set('status', e.target.value)} className={inp}>
              <option value="active">진행중</option>
              <option value="completed">완료</option>
              <option value="cancelled">취소</option>
            </select>
          </Row>
          <Row label="메모">
            <textarea value={form.memo} onChange={e => set('memo', e.target.value)}
              className={inp + ' resize-none'} rows={2} placeholder="비고" />
          </Row>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <label className="w-20 text-sm text-gray-500 pt-2.5 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  )
}
