'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Supplier } from '@/lib/types'

interface Props {
  suppliers: Supplier[]
  ownership?: 'own' | 'other'
  onClose: () => void
  onSaved: () => void
}

const TYPE_MAP: Record<string, string> = {
  '굴삭기': 'excavator', '굴착기': 'excavator', 'excavator': 'excavator',
  '덤프': 'dump', '덤프트럭': 'dump', 'dump': 'dump',
  '화물차': 'truck', '화물': 'truck', '대형화물': 'truck', '트럭': 'truck',
  '5톤트럭': 'truck', '포터': 'truck', '포터2': 'truck', '봉고': 'truck', '봉고3': 'truck',
  '투아렉': 'truck', '트라고': 'truck', 'truck': 'truck',
}

function detectType(raw: string): string {
  const s = raw.replace(/\n/g, ' ').trim()
  for (const [key, val] of Object.entries(TYPE_MAP)) {
    if (s.startsWith(key) || s.includes(key)) return val
  }
  return 'truck'
}

// 소속업체 이름에서 "(100%)" 같은 괄호 표기 제거 후 가장 긴 업체명 매칭
// 엑셀 날짜 serial → YYYY-MM-DD 변환
function parseDate(val: any): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  const s = String(val).trim()
  if (!s) return null
  // 이미 날짜 형식이면 그대로
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // YYYY.MM.DD 형식
  if (/^\d{4}\.\d{2}\.\d{2}/.test(s)) return s.slice(0, 10).replace(/\./g, '-')
  return s.slice(0, 10)
}

function matchSupplier(raw: string, suppliers: Supplier[]): string | null {
  if (!raw) return null
  const clean = raw.replace(/\(.*?\)/g, '').replace(/\s+/g, '').trim()
  const rawTrim = raw.replace(/\s+/g, '').trim()

  // 1) 업체명 직접 매칭
  let found = suppliers.find(s => s.name === raw || s.name === clean)
  if (found) return found.id

  // 2) 대표자명(ceo_name) 완전/부분 매칭
  found = suppliers.find(s => s.ceo_name && (
    rawTrim === s.ceo_name.replace(/\s+/g, '') ||
    clean === s.ceo_name.replace(/\s+/g, '') ||
    raw.includes(s.ceo_name) ||
    s.ceo_name.includes(clean)
  ))
  if (found) return found.id

  // 3) 업체명 부분 포함 (공백 무시)
  found = suppliers.find(s => {
    const sName = s.name.replace(/\s+/g, '')
    return rawTrim.includes(sName) || sName.includes(clean)
  })
  if (found) return found.id

  return null
}

export default function EquipmentExcelUploadModal({ suppliers, ownership = 'own', onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<'upload' | 'preview'>('upload')

  // (supplierMap 제거 - matchSupplier가 suppliers 배열 직접 사용)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // 헤더 찾기
    const KNOWN = ['차량번호', '소속업체', '장비종류', '차종', '차주명', '종류', '보험료', '규격', '모델', '정기검사', '보험']
    let headerIdx = 0
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      if (raw[i].some((c: any) => KNOWN.includes(String(c).trim()))) { headerIdx = i; break }
    }
    const headers = raw[headerIdx].map((h: any) => String(h).trim())
    const rows = raw.slice(headerIdx + 1).filter(r => r.some((c: any) => c !== ''))

    const parsed: any[] = []
    const errs: string[] = []

    rows.forEach((row, idx) => {
      const get = (keys: string[]) => {
        for (const k of keys) {
          const i = headers.findIndex(h => h.includes(k))
          if (i >= 0 && row[i] !== '') return String(row[i]).trim()
        }
        return ''
      }
      const getDate = (keys: string[]) => {
        for (const k of keys) {
          const i = headers.findIndex(h => h.includes(k))
          if (i >= 0 && row[i] !== '') return parseDate(row[i])
        }
        return null
      }

      const supplierName = get(['차주명', '차주', '소속업체', '업체', '대표자', '성명', '이름', '소유자', '업체명', '회사명', 'owner'])
      const supplierId = matchSupplier(supplierName, suppliers)
      if (supplierName && !supplierId) {
        errs.push(`${idx + 1}행: 업체 "${supplierName}" 없음 → 자동 스킵`)
      }

      const typeRaw = get(['차종', '장비종류', '종류', '타입'])
      const type = detectType(typeRaw)

      // 차종에서 규격 추출 (예: "굴삭기03LC" → "03LC", "덤프15톤" → "15톤")
      const specFromType = typeRaw.replace(/굴삭기|굴착기|덤프트럭|덤프|화물차|화물|트럭/gi, '').trim() || null
      const premiumRaw = get(['보험료'])
      const premium = premiumRaw ? Number(premiumRaw.replace(/,/g, '')) : null

      parsed.push({
        supplier_id: supplierId,
        supplier_name_raw: supplierName,
        type,
        plate_no: get(['차량번호', '번호']) || null,
        model: get(['모델명', '모델']) || null,
        spec: get(['규격']) || specFromType || null,
        reg_no: get(['등록번호']) || null,
        year: get(['연식']) ? Number(get(['연식'])) : null,
        inspection_expire: getDate(['정기검사', '검사만료', '검사']),
        insurance_expire: getDate(['보험만료', '보험 만료', '보험']),
        insurance_premium: premium,
        memo: get(['메모', '비고']) || null,
        ownership,
        status: 'available',
      })
    })

    setErrors(errs)
    setPreview(parsed)
    setStep('preview')
  }

  async function handleImport() {
    setSaving(true)
    const rows = preview.filter(r => r.supplier_id).map(({ supplier_name_raw, ...rest }) => rest)
    if (rows.length === 0) { alert('등록 가능한 행이 없습니다.'); setSaving(false); return }
    const { error } = await supabase.from('equipment').insert(rows)
    setSaving(false)
    if (error) { alert('오류: ' + error.message); return }
    onSaved()
  }

  const validRows = preview.filter(r => r.supplier_id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="font-bold text-gray-900">장비 엑셀 업로드</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'upload' && (
            <div>
              <div className="text-center py-8">
                <div className="text-5xl mb-4">🚜</div>
                <p className="text-gray-600 mb-2 font-medium">장비 목록 엑셀 파일을 선택하세요</p>
                <p className="text-xs text-gray-400 mb-1">.xlsx / .xls 형식</p>
                <p className="text-xs text-gray-400 mb-6">헤더: 소속업체, 장비종류, 차량번호, 규격, 모델명, 정기검사, 보험만료, 보험료, 연식, 메모</p>
                <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={handleFile} className="hidden" />
                <button onClick={() => fileRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg">
                  파일 선택
                </button>
              </div>
              <div className="mt-4 bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
                <p className="font-medium text-gray-700 mb-2">엑셀 양식 안내</p>
                <p>• <b>소속업체</b>: 업체명 또는 대표자명으로 자동 매칭 (예: 이영규, 이영규(100%))</p>
                <p>• <b>장비종류</b>: 굴삭기 / 덤프 / 화물차</p>
                <p>• <b>보험료</b>: 숫자만 입력 (원 단위)</p>
                <p>• <b>정기검사, 보험만료</b>: YYYY-MM-DD 형식</p>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div>
              <div className="flex gap-4 mb-3 flex-wrap">
                <span className="text-sm text-gray-500">총 <b className="text-gray-800">{preview.length}행</b> 감지</span>
                <span className="text-sm text-green-600">등록 가능 <b>{validRows.length}건</b></span>
                {errors.length > 0 && <span className="text-sm text-red-500">스킵 <b>{errors.length}건</b></span>}
              </div>
              {validRows.length === 0 && preview.length > 0 && (
                <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
                  <p className="font-medium mb-1">업체 매칭 실패 — 엑셀 컬럼명을 확인하세요</p>
                  <p>지원 컬럼명: <b>소속업체, 업체, 대표자, 차주, 성명, 이름, 소유자</b></p>
                  <p className="mt-1">또는 중기업체 관리에서 대표자명을 먼저 입력해주세요.</p>
                </div>
              )}
              {errors.length > 0 && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3">
                  {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-left px-3 py-2">업체</th>
                      <th className="text-left px-3 py-2">종류</th>
                      <th className="text-left px-3 py-2">차량번호</th>
                      <th className="text-left px-3 py-2">규격</th>
                      <th className="text-right px-3 py-2">보험료</th>
                      <th className="text-left px-3 py-2">보험만료</th>
                      <th className="text-center px-3 py-2">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((r, i) => (
                      <tr key={i} className={r.supplier_id ? '' : 'bg-red-50 opacity-60'}>
                        <td className="px-3 py-1.5 font-medium text-gray-800">{r.supplier_name_raw || '-'}</td>
                        <td className="px-3 py-1.5">{r.type === 'excavator' ? '굴삭기' : r.type === 'dump' ? '덤프' : '화물차'}</td>
                        <td className="px-3 py-1.5">{r.plate_no ?? '-'}</td>
                        <td className="px-3 py-1.5">{r.spec ?? '-'}</td>
                        <td className="px-3 py-1.5 text-right">{r.insurance_premium ? r.insurance_premium.toLocaleString() : '-'}</td>
                        <td className="px-3 py-1.5 text-gray-500">{r.insurance_expire ?? '-'}</td>
                        <td className="px-3 py-1.5 text-center">
                          {r.supplier_id
                            ? <span className="text-green-600">✓</span>
                            : <span className="text-red-400">업체없음</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-200 shrink-0">
          {step === 'preview' ? (
            <>
              <button onClick={() => setStep('upload')} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">← 다시 선택</button>
              <button onClick={handleImport} disabled={saving || validRows.length === 0}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium">
                {saving ? '등록 중...' : `✓ ${validRows.length}건 등록`}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">취소</button>
          )}
        </div>
      </div>
    </div>
  )
}
