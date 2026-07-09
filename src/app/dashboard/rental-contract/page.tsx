'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─────────────────────────────────────────────
// 표준약관 전문 상수
// ─────────────────────────────────────────────
const STANDARD_TERMS = `건설기계임대차 표준계약 일반조건

제1조 (총 칙) 건설기계임대인(이하 "갑"이라 한다)과 건설기계임차인(이하 "을"이라 한다)은 대등한 입장에서 서로 협력하여 신의에 따라 성실히 계약을 이행한다.

제2조 (사용기간) 사용기간은 계약서에 명시된 일자로 한다. 다만, 사용기간을 연장하고자 하는 경우에는 "갑"과 "을"이 협의하여 연장할 수 있다.

제3조 (건설기계의 가동시간) ① 건설기계의 가동시간은 1일 8시간, 월 200시간을 기준으로 한다.

② "갑"의 귀책사유로 인해 제1항의 기준시간에 미달한 경우에는 연장작업을 제공하거나 대여대금에서 이를 공제하고, "을"의 귀책사유로 인해 제1항의 기준시간에 미달하는 경우에는 기준시간을 가동한 것으로 간주한다.

③ 야간작업과 기준시간 초과 작업에 의한 시간당 대여대금은 주간작업에 의한 시간당 대여대금에 관련법령이 정한 시간당 건설기계 손료 및 건설기계조종사(조수 포함, 이하 같다) 임금을 다음의 산식에 적용하여 산출된 율을 곱하여 산정한 금액으로 하되, 별도 정산 처리한다. 다만, 야간작업시간에 대한 건설기계조종사의 인건비는 근로기준법 제56조 규정에 따른다.

(시간당기계손료×8)+(건설기계조종사임금×1.5)
조정율 = -------------------------------------------------
         (시간당기계손료×8)+(건설기계조종사임금×1.0)

④ 작업시간은 "갑"과 "을"이 서로 확인한 작업일보에 의한다.

제4조 (대여대금 등) ① 대여대금은 계약서에 명시된 금액으로 한다.

② 제1항의 규정에 의한 대여대금에는 건설기계조종사의 급여액, 기계손료(상각비, 정비비 및 관리비)가 포함된 금액으로 한다.

③ 분해·조립비는 원칙적으로 "을"이 부담하되, 그 금액은 "갑"과 "을"이 합의하여 정한다. 다만, 제9조제2항, 제10조제2항에 규정된 갑의 책임있는 사유로 건설기계를 대체하거나 계약을 해지하는 경우에는 "갑"이 분해·조립비를 부담한다.

④ 1개월 이상 임차하는 경우로서 사용기간 중 건설기계의 고장, 천재지변 등으로 1개월 중 5일 이상 가동하지 못하였을 경우 당월 대여대금에서 공제한다.

제5조 (경비 등의 부담) ① 건설기계 가동에 필요한 유류비 및 운반비는 "을"이 부담하는 것을 원칙으로 하되, 기종별, 현장여건을 고려 "갑"과 "을"이 합의하여 정한다.

② 건설기계조종사의 숙식제공, 소모품, 수선비 등 그 밖의 소요비용은 "갑"과 "을"이 합의하여 정한 바에 의한다.

제6조 (대여대금 지불조건) ① "을"은 건설기계 대여기간이 1개월을 초과하는 경우에는 매월 종료하는 날부터, 대여기간이 1개월 이하인 경우에는 그 기간이 종료하는 날부터 각각 60일 이내의 가능한 짧은 기한으로 정한 지급기일까지 "갑"에게 대여대금을 지급하여야 한다.

② "을"은 "을"에게 건설공사를 도급(하도급을 포함한다)한 자(이하 "병"이라 한다)로부터 준공금을 받은 때에는 대여대금을, 기성금을 받은 때에는 건설기계를 임차하여 시공한 분에 상당하는 대여대금을 각각 지급받은 날(공사대금을 어음으로 받은 때에는 그 어음만기일을 말한다)부터 15일 이내에 "갑"에게 현금으로 지급하여야 한다.

③ "을"이 대여대금을 "갑"에게 지급하지 아니한 다음 각 호의 경우에는 "갑"은 "병"에게 대여대금의 직접지급을 요청할 수 있다.

1. "병"과 "을"이 대여대금을 "갑"에게 직접지급 할 수 있다는 뜻과 그 지급의 방법·절차를 명백히 하여 합의한 경우
2. "갑"이 "을"을 상대로 "갑"이 시공한 분에 대한 대여대금의 지급을 명하는 확정 판결을 받은 경우
3. 국가·지방자체단체 또는 정부투자기관이 발주한 건설공사 중 "을"이 "갑"이 시공한 분의 대여대금을 1회 이상 지체한 경우
4. "을"의 파산 등으로 인하여 "을"이 "갑"의 대여대금을 지급할 수 없는 명백한 사유가 있다고 "병"이 인정하는 경우

④ "병"은 다음 각 호의 경우에는 "갑"에게 대여대금을 직접 지급하여야 한다.

1. "병"이 대여대금을 "갑"에게 직접 지급하기로 "갑", "을" 및 "병"이 그 뜻과 지급의 방법·절차를 명백히 하여 합의한 경우
2. "을"이 제2항의 규정에 의한 대여대금의 지급을 2회 이상 지체한 경우로서 "갑"이 "병"에게 대여대금의 직접지급을 요청한 경우
3. "을"의 지급정지·파산 그 밖에 이와 유사한 사유가 있거나 건설업의 등록 등이 취소되어 "을"이 대여대금을 지급할 수 없게 된 경우로서 "갑"이 "병"에게 하도급대금의 직접지급을 요청한 경우

제6조의2 (건설기계 대여대금 지급보증) "을"은 건설산업기본법 시행규칙 제34조의4의 규정에 따라 건설기계 대여계약 금액(분할계약 시 합산)이 200만원을 초과할 경우 "갑"에게 그 대금의 지급을 보증하는 보증서를 주어야 한다.

제7조 (전대 및 사용목적 이외의 사용금지) ① "을"은 당해 건설기계를 임대차 목적 외로 사용하거나 타인에게 전대할 수 없다.

② "갑"은 이 계약으로부터 발생하는 권리 또는 의무를 제3자에게 양도하거나 처분할 수 없다. 다만, 상대방의 서면에 의한 승낙을 받았을 때에는 그러하지 아니하다.

제8조 ("갑"의 권리와 의무) ① "갑"은 건설기계가 정상적으로 가동될 수 있도록 예방정비를 철저히 하여야 한다.

② "갑"은 "을"의 요구가 있는 경우에는 건설기계등록증·보험(공제)가입증명서·건설기계조종사 면허증 등을 제시하여야 한다.

③ "갑"은 건설기계가 관계법령에 의하여 의무적으로 보험[자동차보험(건설기계공제) 또는 산재보험]에 가입하여야 하거나 정기검사 대상 건설기계인 경우에는 그 사실을 증명할 수 있는 증빙서류를 "을"에게 제시하여야 한다.

④ "갑"의 건설기계조종사는 "을"의 현장책임자의 지휘·감독에 따라 작업을 수행한다.

제9조 ("을"의 권리와 의무) ① "을"은 현장내 지하매설물, 지상위험물 등에 대하여 건설기계조종사에게 작업전 충분히 고지하여야 하며, 건설기계가 안전하게 작업을 진행할 수 있도록 하여야 한다.

② "을"은 계약기간 중 "갑"의 건설기계가 정기검사 등에 해당하는 경우에는 "갑"이 그 검사 등을 받을 수 있도록 조치하여야 하며, "갑"은 검사기간이 1일을 초과하는 경우 계약조건과 동일한 장비로 대체하여 작업에 지장이 없도록 조치하여야 한다.

제10조 (계약해제 및 해지) ① 당사자 일방이 계약조건을 위반하여 계약의 목적을 달성할 수 없다고 인정되는 경우에는 상대방은 서면으로 상당한 기간을 정하여 이행을 최고하고, 기한 내에 이행하지 아니하는 경우에는 계약을 해제 또는 해지할 수 있다.

② "을"은 "갑"의 건설기계가 5일 이상의 정비를 필요로 하는 경우 "갑"과 합의하여 계약을 해지할 수 있다. 다만, 동일한 건설기계를 대체하였을 경우에는 그러하지 아니한다.

제11조 (분쟁의 해결) ① 이 계약서에 별도로 규정된 것을 제외하고는 계약에서 발생하는 문제에 관한 분쟁은 "갑"과 "을"이 쌍방의 합의에 의하여 해결한다.

② 제1항의 합의가 성립하지 못할 때에는 당사자는 건설산업기본법에 의하여 설치된 건설분쟁조정위원회에 조정을 신청하거나 다른 법령에 의하여 설치된 중재기관에 중재를 요청할 수 있다.

제12조 (기타) 본 계약서에 명시하지 않은 사항에 대하여는 일반 상관례 및 제반 법률규정에 따라 처리하기로 한다.

제13조 (특약사항) 기타 이 계약에서 정하지 아니한 사항에 대하여는 "갑"과 "을"이 합의하여 별도의 특약을 정할 수 있다.`

// ─────────────────────────────────────────────
// 상수 / 헬퍼
// ─────────────────────────────────────────────
const GAON = {
  name: '㈜가온건설중기',
  business_no: '315-81-39390',
  ceo: '이현정',
  address: '청주시 흥덕구 옥산면 오산덕촌길 57-21',
}

const EQ_LABEL: Record<string, string> = {
  excavator: '굴삭기',
  dump: '덤프트럭',
  truck: '화물차',
  cargo: '화물차',
}

function fmtDate(v: string): string {
  const d = v.replace(/[^\d]/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return d.slice(0,4) + '.' + d.slice(4)
  return d.slice(0,4) + '.' + d.slice(4,6) + '.' + d.slice(6)
}
function fmtAmt(v: string): string {
  const n = v.replace(/[^\d]/g, '')
  return n ? Number(n).toLocaleString() : ''
}

// ─────────────────────────────────────────────
// 인라인 스타일 공통
// ─────────────────────────────────────────────
const cTd: React.CSSProperties = {
  border: '1px solid #444', padding: '3px 5px', fontSize: 11, verticalAlign: 'middle', overflow: 'hidden',
}
const cTh: React.CSSProperties = {
  border: '1px solid #444', padding: '3px 5px', fontSize: 11, fontWeight: 700,
  background: '#f0f0f0', textAlign: 'center', verticalAlign: 'middle',
}
const cInp: React.CSSProperties = {
  border: 'none', outline: 'none', width: '100%', minWidth: 0,
  fontSize: 11, fontFamily: 'inherit', background: 'transparent', padding: 0,
}
const cTA: React.CSSProperties = {
  border: 'none', outline: 'none', width: '100%', minWidth: 0,
  fontSize: 11, fontFamily: 'inherit', background: 'transparent', padding: 0,
  resize: 'none', overflow: 'hidden', display: 'block', lineHeight: 1.4,
}
const AR = (e: React.FormEvent<HTMLTextAreaElement>) => {
  const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'
}

// ─────────────────────────────────────────────
// 폼 타입
// ─────────────────────────────────────────────
interface ContractForm {
  lessor_name: string; lessor_biz_no: string; lessor_ceo: string; lessor_addr: string
  lessee_name: string; lessee_biz_no: string; lessee_ceo: string; lessee_addr: string
  equip_name: string; equip_reg_no: string; equip_model: string
  insurance_yn: string; inspection_yn: string; equip_note: string
  site_name: string; site_addr: string; orderer: string
  contractor: string; guarantee_yn: string; site_note: string
  period_start: string; period_end: string
  daily_amount: string; total_amount: string
  working_hours: string; payment_days: string
  contract_date: string
}

const INIT_F: ContractForm = {
  lessor_name: GAON.name, lessor_biz_no: GAON.business_no,
  lessor_ceo: GAON.ceo, lessor_addr: GAON.address,
  lessee_name: '', lessee_biz_no: '', lessee_ceo: '', lessee_addr: '',
  equip_name: '', equip_reg_no: '', equip_model: '',
  insurance_yn: '여', inspection_yn: '여', equip_note: '',
  site_name: '', site_addr: '', orderer: '',
  contractor: '', guarantee_yn: '여', site_note: '',
  period_start: '', period_end: '',
  daily_amount: '', total_amount: '',
  working_hours: '1일 8시간 기준, 월 200시간 기준', payment_days: '30',
  contract_date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────
export default function RentalContractPage() {
  const supabase = createClient()
  const printAreaRef = useRef<HTMLDivElement>(null)

  const [suppliers, setSuppliers] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [equipList, setEquipList] = useState<any[]>([])

  const [selectedSupId, setSelectedSupId] = useState<string>('gaon')
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [selectedEquipId, setSelectedEquipId] = useState<string>('')

  const [stampImg, setStampImg] = useState<string>('')
  const [form, setForm] = useState<ContractForm>(INIT_F)
  const [showTerms, setShowTerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string>('')
  const [contracts, setContracts] = useState<any[]>([])
  const [attachChecks, setAttachChecks] = useState({ biz_reg: false, equip_reg: false, insurance: false })

  // 스케일 / 높이
  const [docScale, setDocScale] = useState(1)
  const [docHeight, setDocHeight] = useState(0)

  useEffect(() => {
    const update = () => setDocScale(Math.min(1, (window.innerWidth - 32) / 900))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    const el = printAreaRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setDocHeight(el.offsetHeight))
    ro.observe(el)
    setDocHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [showTerms, form])

  // 초기 데이터 로드
  useEffect(() => {
    supabase.from('suppliers').select('*').eq('status', 'active')
      .then(({ data }) => setSuppliers((data ?? []).sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko'))))
    supabase.from('clients').select('*').order('name')
      .then(({ data }) => setClients(data ?? []))
    // 가온 도장
    const gaonStamp = localStorage.getItem('ts_stamp') ?? ''
    setStampImg(gaonStamp)
    // 자차 장비 로드
    supabase.from('equipment').select('*').eq('ownership', 'own').order('plate_no')
      .then(({ data }) => setEquipList(data ?? []))
    supabase.from('rental_contracts').select('id,contract_date,lessee_name,site_name').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setContracts(data ?? []))
  }, [])

  // 임대인 변경 → 회사정보 + 장비목록 + 도장 갱신
  useEffect(() => {
    if (selectedSupId === 'gaon') {
      setForm(p => ({
        ...p,
        lessor_name: GAON.name,
        lessor_biz_no: GAON.business_no,
        lessor_ceo: GAON.ceo,
        lessor_addr: GAON.address,
      }))
      const stamp = localStorage.getItem('ts_stamp') ?? ''
      setStampImg(stamp)
      supabase.from('equipment').select('*').eq('ownership', 'own').order('plate_no')
        .then(({ data }) => setEquipList(data ?? []))
    } else {
      const sup = suppliers.find((s: any) => s.id === selectedSupId)
      if (sup) {
        setForm(p => ({
          ...p,
          lessor_name: sup.name ?? '',
          lessor_biz_no: sup.business_no ?? '',
          lessor_ceo: sup.ceo_name ?? '',
          lessor_addr: sup.address ?? '',
        }))
        const localStamp = localStorage.getItem(`ts_stamp_sup_${sup.id}`) ?? ''
        if (localStamp) setStampImg(localStamp)
        supabase.from('suppliers').select('stamp_data').eq('id', sup.id).single()
          .then(({ data }: { data: { stamp_data?: string | null } | null }) => {
            if (data?.stamp_data) {
              setStampImg(data.stamp_data)
              try { localStorage.setItem(`ts_stamp_sup_${sup.id}`, data.stamp_data) } catch {}
            }
          })
        supabase.from('equipment').select('*').eq('supplier_id', sup.id).order('plate_no')
          .then(({ data }) => setEquipList(data ?? []))
      }
    }
    setSelectedEquipId('')
  }, [selectedSupId, suppliers])

  // 임차인 변경 → 임차인 정보 자동 입력
  useEffect(() => {
    if (!selectedClientId) return
    const cli = clients.find((c: any) => c.id === selectedClientId)
    if (cli) {
      setForm(p => ({
        ...p,
        lessee_name: cli.name ?? '',
        lessee_biz_no: cli.business_no ?? '',
        lessee_ceo: cli.ceo_name ?? '',
        lessee_addr: cli.address ?? '',
        contractor: cli.name ?? '',
      }))
    }
  }, [selectedClientId, clients])

  // 장비 변경 → 장비 정보 자동 입력
  useEffect(() => {
    if (!selectedEquipId) return
    const eq = equipList.find((e: any) => e.id === selectedEquipId)
    if (eq) {
      const today = new Date().toISOString().slice(0, 10)
      let inspYn = '부'
      if (eq.inspection_expire) {
        const [y, m, d] = eq.inspection_expire.split('-').map(Number)
        const exp = new Date(y, m - 1, d)
        exp.setDate(exp.getDate() + 30)
        inspYn = exp.toISOString().slice(0, 10) > today ? '여' : '부'
      }
      setForm(p => ({
        ...p,
        equip_name: EQ_LABEL[eq.type] ?? eq.type ?? '',
        equip_reg_no: eq.plate_no ?? '',
        equip_model: eq.spec ?? eq.model ?? '',
        insurance_yn: eq.insurance_expire && eq.insurance_expire > today ? '여' : '부',
        inspection_yn: inspYn,
      }))
    }
  }, [selectedEquipId, equipList])

  // form 로드 후 textarea 자동 높이 조정
  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.print-doc textarea').forEach((t: any) => {
        t.style.height = 'auto'
        t.style.height = t.scrollHeight + 'px'
      })
    }, 50)
    return () => clearTimeout(timer)
  }, [form])

  function setF(k: keyof ContractForm, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

  // DB 저장
  async function loadContract(id: string) {
    const { data } = await supabase.from('rental_contracts').select('*').eq('id', id).single()
    if (!data) return
    setSavedId(id)
    const toD = (s: string | null) => s ? s.replace(/-/g, '.') : ''
    setForm({
      lessor_name: data.lessor_name ?? '', lessor_biz_no: data.lessor_business_no ?? '',
      lessor_ceo: data.lessor_ceo ?? '', lessor_addr: data.lessor_address ?? '',
      lessee_name: data.lessee_name ?? '', lessee_biz_no: data.lessee_business_no ?? '',
      lessee_ceo: data.lessee_ceo ?? '', lessee_addr: data.lessee_address ?? '',
      equip_name: data.equip_name ?? '', equip_reg_no: data.equip_reg_no ?? '',
      equip_model: data.equip_model ?? '', insurance_yn: data.insurance_yn ?? '',
      inspection_yn: data.inspection_yn ?? '', equip_note: data.equip_note ?? '',
      site_name: data.site_name ?? '', site_addr: data.site_address ?? '',
      orderer: data.orderer ?? '', contractor: data.contractor ?? '',
      guarantee_yn: data.guarantee_yn ?? '', site_note: data.site_note ?? '',
      period_start: toD(data.period_start), period_end: toD(data.period_end),
      daily_amount: data.daily_amount ? Number(data.daily_amount).toLocaleString() : '',
      total_amount: data.total_amount ? Number(data.total_amount).toLocaleString() : '',
      working_hours: data.working_hours ?? '8', payment_days: String(data.payment_days ?? '30'),
      contract_date: toD(data.contract_date),
    })
  }

  async function deleteContract() {
    if (!savedId) return
    if (!confirm('이 계약서를 삭제할까요?')) return
    const { error } = await supabase.from('rental_contracts').delete().eq('id', savedId)
    if (error) { alert('삭제 실패: ' + error.message); return }
    setContracts(prev => prev.filter((c: any) => c.id !== savedId))
    setSavedId('')
    alert('삭제되었습니다.')
  }

  async function saveContract(forceNew = false): Promise<string | null> {
    setSaving(true)
    const payload = {
      supplier_id: selectedSupId === 'gaon' ? null : (selectedSupId || null),
      is_own_equipment: selectedSupId === 'gaon',
      client_id: selectedClientId || null,
      equipment_id: selectedEquipId || null,
      lessor_name: form.lessor_name, lessor_business_no: form.lessor_biz_no,
      lessor_ceo: form.lessor_ceo, lessor_address: form.lessor_addr,
      lessee_name: form.lessee_name, lessee_business_no: form.lessee_biz_no,
      lessee_ceo: form.lessee_ceo, lessee_address: form.lessee_addr,
      equip_name: form.equip_name, equip_reg_no: form.equip_reg_no,
      equip_model: form.equip_model, insurance_yn: form.insurance_yn,
      inspection_yn: form.inspection_yn, equip_note: form.equip_note,
      site_name: form.site_name, site_address: form.site_addr,
      orderer: form.orderer, contractor: form.contractor,
      guarantee_yn: form.guarantee_yn, site_note: form.site_note,
      period_start: form.period_start ? form.period_start.replace(/\./g, '-') : null, period_end: form.period_end ? form.period_end.replace(/\./g, '-') : null,
      daily_amount: parseFloat(form.daily_amount.replace(/,/g, '')) || null,
      total_amount: parseFloat(form.total_amount.replace(/,/g, '')) || null,
      working_hours: form.working_hours,
      payment_days: parseInt(form.payment_days) || 30,
      contract_date: form.contract_date ? form.contract_date.replace(/\./g, '-') : null,
    }

    let result: { data: { id: string } | null; error: any }
    if (!forceNew && savedId) {
      result = await supabase.from('rental_contracts').update(payload).eq('id', savedId).select('id').single()
    } else {
      result = await supabase.from('rental_contracts').insert(payload).select('id').single()
    }
    const { data, error } = result
    setSaving(false)

    if (error) {
      alert('저장 실패: ' + error.message)
      return null
    }
    const id = (data as { id: string } | null)?.id ?? savedId
    if (id) setSavedId(id)
    return id || null
  }

  async function handleSave() {
    const id = await saveContract()
    if (id) alert('✅ 계약서가 저장됐습니다.')
  }

  async function copyContract() {
    const newId = await saveContract(true)
    if (!newId) return
    setSavedId(newId)
    setContracts(prev => [{ id: newId, contract_date: form.contract_date.replace(/\./g,'-'), lessee_name: form.lessee_name, site_name: form.site_name }, ...prev])
    alert('📋 계약서가 복사되었습니다.')
  }

  function handlePrint() {
    window.print()
  }

  async function handleJpg() {
    const el = printAreaRef.current
    if (!el) return
    try {
      const { toJpeg } = await import('html-to-image')

      const captureStyle = document.createElement('style')
      captureStyle.id = 'rc-capture-style'
      captureStyle.textContent = `.no-print { display: none !important; } .no-print-sel { display: none !important; } input[type="radio"], input[type="checkbox"] { accent-color: #333; }`
      document.head.appendChild(captureStyle)

      const origTransform = el.style.transform
      const origW = el.style.width
      el.style.transform = 'none'
      el.style.width = '900px'
      void el.getBoundingClientRect()
      await new Promise(r => setTimeout(r, 400))

      const dataUrl = await toJpeg(el, {
        quality: 0.95, pixelRatio: 2, backgroundColor: '#ffffff',
        width: 900, height: Math.max(1123, el.scrollHeight),
      })

      el.style.transform = origTransform
      el.style.width = origW
      document.getElementById('rc-capture-style')?.remove()

      const filename = `임대차계약서_${form.lessee_name || '미입력'}.jpg`
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], filename, { type: 'image/jpeg' })

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: '임대차계약서' }); return }
        catch (e: any) { if (e?.name === 'AbortError') return }
      }
      try {
        const canvas = document.createElement('canvas')
        const img = new Image()
        await new Promise<void>(r => { img.onload = () => r(); img.src = dataUrl })
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        const png = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
        alert('✅ 클립보드에 복사됐습니다!\n카카오톡 채팅창에서 붙여넣기 하세요.')
        return
      } catch {}

      const link = document.createElement('a')
      link.href = dataUrl; link.download = filename
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
      alert('📥 이미지가 다운로드됐습니다.')
    } catch (e) { alert('공유 실패: ' + String(e)) }
  }

  async function handleShare() {
    let id = savedId
    if (!id) {
      id = (await saveContract()) ?? ''
      if (!id) return
    }
    const url = `${window.location.origin}/sign/rental/${id}`
    if (navigator.share) {
      try {
        await navigator.share({ title: '임대차계약서 서명 요청', text: '아래 링크에서 계약서를 확인하고 서명해 주세요.', url })
        return
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url)
      alert('✅ 서명 링크가 클립보드에 복사됐습니다!\n임차인에게 공유하세요.')
    } catch {
      prompt('아래 링크를 복사해서 공유하세요:', url)
    }
  }

  const ynOpts = ['여', '부']
  const pdOpts = ['30', '60']

  const sigRow = (label: string, key: keyof ContractForm, hasStamp?: boolean, beforeContent?: React.ReactNode) => (
    <tr key={key}>
      <td style={{ ...cTd, width: 90, fontWeight: 600, background: '#fafafa', whiteSpace: 'nowrap' }}>{label}</td>
      <td style={{ ...cTd, position: 'relative', overflow: 'visible' }}>
        {beforeContent}
        <textarea value={form[key]} onChange={e => setF(key, e.target.value)} style={cTA} rows={1} onInput={AR} />
        {hasStamp && stampImg && (
          <img src={stampImg} alt="도장"
            style={{ position: 'absolute', right: -22, top: '50%', marginTop: -22, width: 44, height: 44, objectFit: 'contain', zIndex: 10, opacity: 0.85 }} />
        )}
      </td>
    </tr>
  )

  return (
    <div className="min-h-screen bg-[#f3f0ea]">
      {/* ── 툴바 ── */}
      <div className="no-print sticky top-0 z-30 flex flex-wrap gap-2 items-center bg-white border-b border-gray-200 px-3 py-2.5 shadow-sm">
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          <select onChange={e => { if (e.target.value) loadContract(e.target.value) }}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[160px] truncate">
            <option value="">📂 저정된 계약서…</option>
            {contracts.map((c: any) => <option key={c.id} value={c.id}>{c.contract_date ? c.contract_date.replace(/-/g,'.') : '--'} {c.lessee_name} {c.site_name}</option>)}
          </select>
          {savedId && (
            <button onClick={copyContract}
              className="text-xs bg-blue-500 hover:bg-blue-600 text-white rounded px-2 py-1.5">
              📋 복사
            </button>
          )}
          {savedId && (
            <button onClick={deleteContract}
              className="text-xs bg-red-500 hover:bg-red-600 text-white rounded px-2 py-1.5">
              🗑 삭제
            </button>
          )}

          <select value={selectedSupId} onChange={e => setSelectedSupId(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[150px] truncate">
            <option value="gaon">㈜가온건설중기 (자차)</option>
            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[140px] truncate">
            <option value="">임차인 선택…</option>
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={selectedEquipId} onChange={e => setSelectedEquipId(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white max-w-[140px] truncate">
            <option value="">장비 선택…</option>
            {equipList.map((e: any) => <option key={e.id} value={e.id}>{EQ_LABEL[e.type] ?? e.type} {e.plate_no}</option>)}
          </select>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setShowTerms(v => !v)}
            className="text-xs px-2 py-1.5 rounded border border-gray-300 bg-white text-gray-600">
            {showTerms ? '약관 숨기기' : '📄 표준약관'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="text-xs px-2.5 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50">
            {saving ? '저장 중…' : '💾 저장'}
          </button>
          <button onClick={handlePrint}
            className="text-xs px-2.5 py-1.5 rounded bg-gray-700 text-white">
            📄 PDF 저장
          </button>
          <button onClick={handleJpg}
            className="text-xs px-2.5 py-1.5 rounded bg-green-600 text-white">
            📷 JPG
          </button>
          <button onClick={handleShare}
            className="text-xs px-2.5 py-1.5 rounded bg-amber-500 text-white">
            🔗 서명링크
          </button>
        </div>
      </div>

      {/* ── 문서 래퍼 ── */}
      <div className="p-4" style={{ display: 'flex', justifyContent: 'center' }}>
        <div className="print-area-wrapper" style={{ width: 900 * docScale, height: docHeight * docScale + 16, overflow: 'hidden', flexShrink: 0 }}>
          <div ref={printAreaRef} className="print-doc" style={{ transform: `scale(${docScale})`, transformOrigin: 'top left', width: 900 }}>

            {/* ── 1페이지: 계약서 본문 ── */}
            <div style={{
              background: '#fff', padding: '44px 52px', minHeight: 1123,
              fontFamily: 'AppleSDGothicNeo, "Malgun Gothic", "맑은 고딕", sans-serif',
            }}>
              {/* 제목 */}
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.08em' }}>건설기계임대차 표준계약서</div>
              </div>
              <div style={{ textAlign: 'right', marginBottom: 22 }}>
                <img src="/icons/ftc-logo.svg" alt="공정거래위원회" style={{ height: 26, display: 'block', marginLeft: 'auto', marginBottom: 2 }} />
                <div style={{ fontSize: 10, color: '#666' }}>표준약관 제10059호 / 2015.10.30. 개정</div>
              </div>

              {/* 1. 목적물의 표시 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>1. 목적물의 표시</div>

                {/* 가. 건설기계 */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11.5, marginBottom: 4 }}>가. 건설기계</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ ...cTh, width: '17%' }}>건설기계명</th>
                        <th style={{ ...cTh, width: '16%' }}>등록번호</th>
                        <th style={{ ...cTh, width: '18%' }}>형식</th>
                        <th style={{ ...cTh, width: '18%' }}>보험(공제)가입현황</th>
                        <th style={{ ...cTh, width: '16%' }}>정기검사 여부</th>
                        <th style={cTh}>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={cTd}><textarea value={form.equip_name} onChange={e => setF('equip_name', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                        <td style={cTd}><textarea value={form.equip_reg_no} onChange={e => setF('equip_reg_no', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                        <td style={cTd}><textarea value={form.equip_model} onChange={e => setF('equip_model', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                        <td style={{ ...cTd, textAlign: 'center' }}>
                          <select value={form.insurance_yn} onChange={e => setF('insurance_yn', e.target.value)}
                            style={{ fontSize: 11, fontFamily: 'inherit', background: 'transparent', border: 'none', outline: 'none', width: '100%', minWidth: 0 }}>
                            {ynOpts.map(v => <option key={v}>{v}</option>)}
                          </select>
                        </td>
                        <td style={{ ...cTd, textAlign: 'center' }}>
                          <select value={form.inspection_yn} onChange={e => setF('inspection_yn', e.target.value)}
                            style={{ fontSize: 11, fontFamily: 'inherit', background: 'transparent', border: 'none', outline: 'none', width: '100%', minWidth: 0 }}>
                            {ynOpts.map(v => <option key={v}>{v}</option>)}
                          </select>
                        </td>
                        <td style={cTd}><textarea value={form.equip_note} onChange={e => setF('equip_note', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 나. 현장 */}
                <div>
                  <div style={{ fontSize: 11.5, marginBottom: 4 }}>나. 현장</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ ...cTh, width: '14%' }}>현장명</th>
                        <th style={{ ...cTh, width: '20%' }}>현장 소재지</th>
                        <th style={{ ...cTh, width: '16%' }}>발주자(원수급인)</th>
                        <th style={{ ...cTh, width: '16%' }}>건설업자(임차인)</th>
                        <th style={{ ...cTh, width: '18%' }}>대여대금 지급보증 여부</th>
                        <th style={cTh}>비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={cTd}><textarea value={form.site_name} onChange={e => setF('site_name', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                        <td style={cTd}><textarea value={form.site_addr} onChange={e => setF('site_addr', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                        <td style={cTd}>
          <select className="no-print-sel" style={{...cTA,fontSize:10,color:'#999'}} onChange={e=>{if(e.target.value)setF('orderer',e.target.value)}}>
            <option value="">발주처 선택▼</option>
            {clients.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <textarea value={form.orderer} onChange={e=>setF('orderer',e.target.value)} style={cTA} rows={1} onInput={AR} />
        </td>
                        <td style={cTd}>
          <select className="no-print-sel" style={{...cTA,fontSize:10,color:'#999'}} onChange={e=>{if(e.target.value)setF('contractor',e.target.value)}}>
            <option value="">임차인 선택▼</option>
            {clients.map((c:any)=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <textarea value={form.contractor} onChange={e=>setF('contractor',e.target.value)} style={cTA} rows={1} onInput={AR} />
        </td>
                        <td style={{ ...cTd, textAlign: 'center' }}>
                          <select value={form.guarantee_yn} onChange={e => setF('guarantee_yn', e.target.value)}
                            style={{ fontSize: 11, fontFamily: 'inherit', background: 'transparent', border: 'none', outline: 'none', width: '100%', minWidth: 0 }}>
                            {ynOpts.map(v => <option key={v}>{v}</option>)}
                          </select>
                        </td>
                        <td style={cTd}><textarea value={form.site_note} onChange={e => setF('site_note', e.target.value)} style={cTA} rows={1} onInput={AR} /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2~5 계약 조건 */}
              <div style={{ marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {/* 사용기간 */}
                    <tr>
                      <td style={{ ...cTd, width: '21%', fontWeight: 700, background: '#fafafa', whiteSpace: 'nowrap' }}>2. 사용기간</td>
                      <td style={{ ...cTd, fontSize: 11 }}>
                        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                          <input value={form.period_start} onChange={e => setF('period_start', e.target.value)}
                            onBlur={e => setF('period_start', fmtDate(e.target.value))}
                            placeholder="YYYY.MM.DD" style={{ ...cInp, width: 96 }} />
                          <span>부터</span>
                          <span style={{ margin: '0 2px' }}>~</span>
                          <input value={form.period_end} onChange={e => setF('period_end', e.target.value)}
                            onBlur={e => setF('period_end', fmtDate(e.target.value))}
                            placeholder="YYYY.MM.DD" style={{ ...cInp, width: 96 }} />
                          <span>까지</span>
                        </span>
                      </td>
                    </tr>
                    {/* 사용금액 */}
                    <tr>
                      <td style={{ ...cTd, fontWeight: 700, background: '#fafafa', whiteSpace: 'nowrap' }}>3. 사용금액</td>
                      <td style={{ ...cTd, fontSize: 11 }}>
                        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                          <span>일당 금</span>
                          <input value={form.daily_amount}
                            onChange={e => setF('daily_amount', e.target.value)}
                            onBlur={e => setF('daily_amount', fmtAmt(e.target.value))}
                            style={{ ...cInp, width: 76, borderBottom: '1px solid #bbb' }} />
                          <span>원,</span>
                          <span style={{ marginLeft: 8 }}>총 금액 금</span>
                          <input value={form.total_amount}
                            onChange={e => setF('total_amount', e.target.value)}
                            onBlur={e => setF('total_amount', fmtAmt(e.target.value))}
                            style={{ ...cInp, width: 86, borderBottom: '1px solid #bbb' }} />
                          <span>원</span>
                          <span style={{ color: '#777', fontSize: 10, marginLeft: 4 }}>(부가가치세 포함, 사후 정산 가능)</span>
                        </span>
                      </td>
                    </tr>
                    {/* 가동시간 */}
                    <tr>
                      <td style={{ ...cTd, fontWeight: 700, background: '#fafafa', whiteSpace: 'nowrap' }}>4. 가동시간</td>
                      <td style={cTd}>
                        <input value={form.working_hours} onChange={e => setF('working_hours', e.target.value)} style={{ ...cInp, fontSize: 11 }} />
                      </td>
                    </tr>
                    {/* 지급시기 */}
                    <tr>
                      <td style={{ ...cTd, fontWeight: 700, background: '#fafafa', whiteSpace: 'nowrap' }}>5. 지급시기</td>
                      <td style={{ ...cTd, fontSize: 11 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {pdOpts.map(v => (
                            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                              <input type="radio" name="payment_days" value={v}
                                checked={form.payment_days === v}
                                onChange={() => setF('payment_days', v)} />
                              {v}일
                            </label>
                          ))}
                          <span style={{ color: '#555' }}>이내</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 확약 문구 */}
              <div style={{ border: '1px solid #444', padding: '10px 14px', marginBottom: 12, fontSize: 11, lineHeight: 1.9 }}>
                건설기계임대인과 건설기계임차인은 합의에 따라 붙임서류에 의하여 계약을 체결하고, 신의에 따라 성실히 계약상의 의무를 이행할 것을 확약하며, 이 계약의 증거로 계약서를 2통 작성하여 서명·날인 후 각 1부씩 보관한다.
              </div>

              {/* 붙임서류 */}
              <div style={{ marginBottom: 8, fontSize: 11 }}>
                <span style={{ fontWeight: 700 }}>붙임서류 &nbsp;</span>
                1. 건설기계임대차 표준계약 일반조건 1부 &nbsp;&nbsp;
                2. 건설기계임대차 계약 특수조건 1부 (필요시)
              </div>

              {/* 첨부서류 체크 */}
              <div style={{ marginBottom: 20, fontSize: 11 }}>
                <span style={{ fontWeight: 700 }}>첨부서류 &nbsp;</span>
                {[
                  { k: 'biz_reg', l: '사업자등록증 사본' },
                  { k: 'equip_reg', l: '건설기계등록증' },
                  { k: 'insurance', l: '보험증권 사본' },
                ].map(d => (
                  <label key={d.k} style={{ marginLeft: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <input type="checkbox"
                      checked={attachChecks[d.k as keyof typeof attachChecks]}
                      onChange={e => setAttachChecks(p => ({ ...p, [d.k]: e.target.checked }))} />
                    {d.l}
                  </label>
                ))}
              </div>

              {/* 계약일 */}
              <div style={{ textAlign: 'center', marginBottom: 22, fontSize: 13 }}>
                <span>계약일 &nbsp;</span>
                <input value={form.contract_date} onChange={e => setF('contract_date', e.target.value)}
                  onBlur={e => setF('contract_date', fmtDate(e.target.value))}
                  style={{ border: 'none', borderBottom: '1px solid #555', outline: 'none', fontSize: 13, width: 120, textAlign: 'center', minWidth: 0, fontFamily: 'inherit', background: 'transparent' }} />
              </div>

              {/* 서명란 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* 임대인 */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th colSpan={2} style={{ ...cTh, textAlign: 'center', fontSize: 12 }}>임대인 (건설기계 사업자)</th></tr>
                  </thead>
                  <tbody>
                    {sigRow('상 호', 'lessor_name', false,
                      <select className="no-print-sel" style={{...cTA,fontSize:10,color:'#999'}} value={selectedSupId} onChange={e=>setSelectedSupId(e.target.value)}>
                        <option value="gaon">가온건설중기 (기본)</option>
                        {suppliers.map((s:any)=><option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    {sigRow('사업자등록번호', 'lessor_biz_no')}
                    {sigRow('성 명 (인)', 'lessor_ceo', true)}
                    {sigRow('주 소', 'lessor_addr')}
                  </tbody>
                </table>

                {/* 임차인 */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th colSpan={2} style={{ ...cTh, textAlign: 'center', fontSize: 12 }}>임차인 (건설업자)</th></tr>
                  </thead>
                  <tbody>
                    {sigRow('상 호', 'lessee_name', false,
                      <select className="no-print-sel" style={{...cTA,fontSize:10,color:'#999'}} onChange={e=>{if(e.target.value)setSelectedClientId(e.target.value)}}>
                        <option value="">발주처/임차인 선택▼</option>
                        {clients.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    {sigRow('사업자등록번호', 'lessee_biz_no')}
                    {sigRow('성 명 (인)', 'lessee_ceo')}
                    {sigRow('주 소', 'lessee_addr')}
                  </tbody>
                </table>
              </div>

              {savedId && (
                <div style={{ marginTop: 12, textAlign: 'right', fontSize: 10, color: '#999' }}>
                  계약서 ID: {savedId}
                </div>
              )}
            </div>

            {/* ── 2페이지: 표준약관 (토글) ── */}
            {showTerms && (
              <div style={{
                background: '#fff', padding: '44px 52px', marginTop: 24,
                fontFamily: 'AppleSDGothicNeo, "Malgun Gothic", "맑은 고딕", sans-serif',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 24 }}>
                  건설기계임대차 표준계약 일반조건
                </div>
                <div style={{ fontSize: 11, lineHeight: 2, whiteSpace: 'pre-wrap' }}>
                  {STANDARD_TERMS}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          header, nav, aside { display: none !important; }
          body, html { margin: 0; padding: 0; background: #fff; overflow: visible !important; }
          @page { size: A4 portrait; margin: 0; }
          main, .flex-1 { overflow: visible !important; height: auto !important; }
          ::-webkit-scrollbar { display: none !important; }
          .print-area-wrapper { height: auto !important; overflow: visible !important; width: auto !important; }
          .print-doc {
            transform: none !important;
            width: 210mm !important;
            padding: 8mm !important;
            box-sizing: border-box !important;
          }
          .print-doc table, .print-doc th, .print-doc td,
          .print-doc textarea, .print-doc input, .print-doc select,
          .print-doc p, .print-doc div, .print-doc span {
            font-size: 13px !important;
          }
          .print-doc h1, .print-doc h2, .print-doc h3 {
            font-size: 16px !important;
          }
          .print-doc select.no-print-sel { display: none !important; }
          .print-doc textarea { border: none !important; outline: none !important; resize: none !important; }
        }
      `}</style>
    </div>
  )
}
