# 장비 플랫폼 HANDOFF

**프로젝트**: `jangbi-platform`  
**작업 폴더**: `C:\Users\mac55\jangbi-platform`  
**배포 URL**: https://jangbi-platform.vercel.app  
**Supabase**: https://qeurmytrzghonavsiqwa.supabase.co  
**최종 정리**: 2026-08-05

---

## 1. 작업 시작 전 필수

### Next.js 주의
- 이 프로젝트의 Next.js는 일반적으로 알고 있는 Next.js와 다를 수 있음.
- 코드 수정 전 관련 문서를 먼저 확인:
  - `node_modules/next/dist/docs/`
- 특히 App Router, page/layout, client component 관련 수정 전 문서 확인.

### 배포 안내
사용자에게 수정 완료 후 항상 아래 배포 코드를 같이 안내할 것.

```bash
cd C:\Users\mac55\jangbi-platform
vercel --prod
```

참고:
- `deploy.bat` 파일도 있음. 사용자는 더블클릭 배포를 선호할 수 있음.
- 그래도 답변에는 위 배포 코드도 항상 포함.

### 검증
- `typescript.ignoreBuildErrors: true` 상태라 빌드가 타입 오류를 놓칠 수 있음.
- 수정 후 가능한 한 TypeScript 검사 실행.
- CLI가 막히면 TypeScript API로 수정 파일 단위 진단이라도 확인.

---

## 2. 절대 주의 규칙

### 장비 타입
- 표준 타입:
  - `excavator` = 굴삭기
  - `dump` = 덤프
  - `truck` = 화물
- 과거 호환 때문에 일부 코드에 `cargo`도 남아 있음.
- 새 화면/로직 만들 때 `truck` 누락 금지.

### 장비 ownership
- `equipment.ownership`:
  - `own` = 자차
  - `other` = 타사
- 장비 **수정(update)** 시 `ownership`을 payload에 넣지 말 것.
- `SupplierEquipmentModal`이 여러 화면에서 공용으로 열리기 때문에 update에 ownership을 넣으면 자차가 타사로 변질될 수 있음.
- ownership은 신규 insert에만 포함.

### SupplierEquipmentModal 공용 주의
`SupplierEquipmentModal`은 아래 여러 곳에서 같이 사용됨.
- 중기업체 신규/수정
- 장비(자차)
- 장비(타사)
- 거래명세서 회사정보수정

주의:
- `allowCreate`가 있을 때만 신규 업체 insert 가능.
- `allowCreate` 없이 업체 미선택이면 글로벌 회사정보(`ts_company`, 가온 공급자)를 수정하는 모드.
- 이 구분을 깨면 가온 정보가 다른 업체 정보로 오염됨.

### 배차등록 메뉴는 일부러 뺀 것 (되살리지 말 것)
- `/dashboard/dispatches` (배차등록 목록) 페이지는 살아 있지만 **사이드바 메뉴에는 없음**.
- 2026-07-08 LogModal 통합 때 의도적으로 내린 것. `작업확인서출력`과 기능이 겹침
  (둘 다 dispatches 나열 + LogModal로 등록/수정 + 삭제).
- **`settings/page.tsx` 권한 목록에는 `/dashboard/dispatches`가 남아 있음.**
  이걸 보고 "메뉴에서 누락됐다"고 판단해 되살리면 안 됨. 실제로 2026-08-05에 한 번 잘못 되살렸다가 원복함.
- 메뉴 관련 판단은 `git log -S"경로" -- src/app/dashboard/layout.tsx`로 이력부터 확인할 것.

### 도장 오염 방지 (견적서 포함)
- 견적서(`estimate/page.tsx`)는 가온 명의 문서라 **글로벌 도장만** 사용.
  - 읽기/쓰기: `ts_stamp`, `ts_stamp_list`
  - **`ts_stamp_sup_*` 와 `suppliers.stamp_data`는 절대 건드리지 말 것.**
- 거래명세서는 업체별 도장을 쓰므로 규칙이 다름 (아래 localStorage 키 항목 참고).
- 도장 목록(`ts_stamp_list`)은 견적서·거래명세서가 공유.

### 모바일 터치 타겟 (.touch-list)
- 목록 카드 컨테이너에 `touch-list` 클래스를 주면 그 안의 button이 최소 44px 높이가 됨 (`globals.css`).
- **문서형 화면(거래명세서/임대차계약서/견적서)에는 절대 붙이지 말 것.** 셀 높이가 밀림.
- 전역 button 규칙으로 만들지 않은 이유도 이것.

### localStorage 키
- `ts_company`: 글로벌 가온 공급자 정보
- `ts_company_sup_{id}`: 업체별 회사 정보
- `ts_stamp_sup_{id}`: 업체별 도장
- `ts_stamp_list`: 도장 목록
- `ts_last_sup_id`: 마지막 선택 업체
- `jangbi:dispatch-registration-draft:v1`: 신규 배차등록 임시저장

도장:
- 원본은 DB `suppliers.stamp_data` 우선.
- localStorage는 캐시 역할.
- 업체별 도장에서는 글로벌 도장 폴백 금지.

### 모바일 문서/표 화면
- 모바일 축소는 `transform: scale()` 사용.
- CSS `zoom` 금지. 모바일에서 표 셀 밀림/잘림 발생함.
- 문서형 input/textarea는 `width: 100%` + `minWidth: 0` 필수.

### Supabase 쓰기
쓰기 후 반드시 error 확인.

```ts
const { error } = await supabase.from('...').update(...)
if (error) {
  alert('저장 오류: ' + error.message)
  return
}
```

조용히 실패하면 사용자는 저장된 줄 앎.

### 큰 파일 수정
- `dispatch-ledger/page.tsx`, `rental-contract/page.tsx`, `trade-statement/page.tsx`는 큰 파일.
- 파일 잘림(truncation) 이슈가 과거 여러 번 있었음.
- 수정 후 파일 끝과 TypeScript 진단 확인.

---

## 3. 현재 최신 동작 요약

### 배차등록 / 일보 입력 모달
파일: `src/app/dashboard/daily-logs/LogModal.tsx`

현재 상태:
- 신규 배차등록은 LogModal로 통합됨.
- 배차등록 화면, 대시보드, 배차내역서 신규 등록 모두 LogModal 사용.
- 차량번호 입력 시 장비 DB와 매칭되면 차종/장비정보/중기업체/차주명 자동 반영.
- 이전작업 복사:
  - 발주처, 현장, 장비, 중기업체, 차주명 복사
  - 이전 daily_logs의 운전자 이름도 복사
  - 이전 배차가 `equipment_id` 방식으로 저장돼 있어도 장비 객체의 차종/차량번호를 현재 입력칸에 풀어서 복사
  - 저장 시 `equipment_text`에 차종+차량번호가 정상 저장되도록 직접입력 모드로 처리
- 신규 배차등록 임시저장:
  - 하나라도 입력하면 localStorage에 자동 저장
  - 모달 닫힘/앱 화면 이동 후 다시 열면 복원
  - 저장 성공 시 임시저장 삭제
  - 기존 일보 수정에는 임시저장 섞이지 않음
- 작업시간:
  - 시간대 1/2/3 지원
  - 시간대별 사용/미사용 체크박스
  - 시간대1 단가 입력 시 같은 작업장치인 시간대2/3 단가 자동 동기화
  - 시간대2/3 단가가 비어 있거나 기존 시간대1 단가를 따라가던 값이면 같이 갱신

### 배차내역서
파일: `src/app/dashboard/dispatch-ledger/page.tsx`

현재 상태:
- 페이지명은 “배차내역서”.
- 오늘 거래일은 노란 배경/`오늘` 배지 표시.
- 청구완료 체크/미체크 정렬 가능:
  - 오른쪽 `청구` 머리글 클릭
  - 다시 클릭하면 순서 반전
- 병합 기준:
  - **서로 다른 배차를 날짜+차량번호만으로 한 줄 병합하지 않음.**
  - 같은 배차 안의 시간대만 병합 표시.
  - 서로 다른 배차를 합치면 수정 대상이 모호해져 6/30 `002더7599` 같은 시간 수정 문제가 발생했음.
- 수정 모달에 시간대3 값도 전달되도록 보완됨.
- 자차/타사 매칭:
  - `equipment_id`가 없어도 `equipment_text`의 차량번호로 장비 DB 매칭 가능.

### 배차등록 목록
파일: `src/app/dashboard/dispatches/page.tsx`

현재 상태:
- 모바일 카드/데스크톱 표 모두 오늘 배차는 노란 배경과 `오늘` 배지 표시.
- 날짜 비교는 UTC가 아니라 브라우저 로컬 날짜 기준.
- daily_logs의 작업시간/시간대 단가를 같이 조회.
- 일보에 시간대가 있으면 dispatches의 단위가 `day`여도 목록에서는 `시간`으로 표시.
- 시간대 단가가 있으면 `시간단가` 컬럼에 우선 표시.
- 정렬도 화면 표시값 기준으로 동작.

### 작업확인서 목록
파일: `src/app/dashboard/daily-logs/page.tsx`

현재 상태:
- 일보에 작업시간이 있으면 작업명이 비어 있어도 시간대 행으로 표시.
- 시간대 단가가 비어 있으면 배차 청구단가를 대신 표시.
- 시간 입력 건이 목록에서 `일` / 단가 `-`로 보이던 케이스 보정됨.

### 대시보드
파일: `src/app/dashboard/page.tsx`

현재 상태:
- A 스타일 대시보드 UI 적용:
  - 웜톤 배경
  - 검정 관제형 헤더
  - 어두운 연간 이윤 분석 패널
  - 하단 KPI 카드 재작성
- 오늘 배차 건수 카드:
  - 총 오늘 배차 건수
  - 전일 대비 증감
  - 우리 장비(자차) / 타사 장비 건수
  - 자차 배차 최대 3개: 차량번호 · 현장명 미리보기
- 자차 집계:
  - `equipment.ownership === 'own'`
  - 또는 `equipment_text`의 차량번호가 자차 장비 목록과 매칭되면 자차로 집계
- 청주시 날씨 위젯 추가 이력 있음.
- 섹션 순서 (2026-08-05 재배치, 오늘 상태 우선):
  1. hero — `오늘 N건 배차중` + 자차/타사 + `+ 배차 등록` (모바일 전체폭)
  2. 메모장 (기본 접힘, 첫 줄 미리보기)
  3. KPI (오늘 배차 / 미수금 / 전월 청구현황)
  4. 통장잔액 + 당월 관리비
  5. 최근 배차 내역 + 정기검사 알림
  6. 연간 이윤 분석
  7. 부가세
  8. 이번 달 계산서 (매출/매입 한 표)
  9. 세무일정 (기본 접힘, 임박 건 있으면 자동 펼침)
- 연간 이윤 분석에 하드코딩된 값 있음: 차주 `이영규`, 차량 `002어6110`, 발주처 `제이에이건설`.

### 사이드바 / 모바일 메뉴
파일: `src/app/dashboard/layout.tsx`

현재 상태:
- A 스타일 사이드바 적용.
- 이모지 대신 SVG 계열 아이콘 사용.
- 활성 메뉴는 어두운 선택 배경 + 앰버 포인트.
- 모바일 드로어도 동일 스타일.
- 메뉴 그룹 (`navItems`의 `group`, 순서는 `GROUP_ORDER`):
  - `배차 업무`: 대시보드 · 배차내역서 · 작업확인서출력
  - `문서 발행`: 거래명세서 · 견적서 · 임대차계약서
  - `기준 정보`: 발주처 · 중기업체 · 장비(자차) · 장비(타사)
  - `관리자메뉴`(접기): 매출/매입계산서 · 부가세 · 통장내역 · 관리비 · 장비별 투입비용
    \+ 개인사업자관리 · 전체 내려받기 · 계정 설정(관리자만)
- `managementHrefs`는 `navItems`에서 파생. 하드코딩 배열 만들지 말 것.
- `EXTRA_LABELS`: 메뉴에 없는 경로의 모바일 헤더 표시명. 새 비메뉴 페이지 추가 시 여기도 등록.
- 앱 화면 오른쪽 스와이프 메뉴 열기 개선:
  - 오른쪽 55px 이상
  - 가로 이동 우세 조건
  - 왼쪽 스와이프 닫힘
  - touchcancel 처리

---

## 4. 문서/거래 관련 최신 상태

### 거래명세서
파일: `src/app/dashboard/trade-statement/page.tsx`

현재 상태:
- 도장 위치:
  - 셀을 밀지 않도록 absolute 배치
  - 모바일 잘림 방지 작업 완료
- 업체별 도장:
  - DB `suppliers.stamp_data` 우선
  - localStorage는 캐시
  - 글로벌 도장 폴백 제거
- 입금계좌 중복 표시 제거.
- 모바일 축소는 transform scale 방식.
- 인쇄/JPG/전체다운로드 시 transform 해제 후 캡처.

### 임대차계약서
파일:
- `src/app/dashboard/rental-contract/page.tsx`
- `src/app/sign/rental/[contractId]/page.tsx`

현재 상태:
- 건설기계임대차 표준계약서 페이지 신설됨.
- 저장된 계약서 불러오기/복사/삭제 가능.
- 발주처·임차인 드롭다운.
- 임대인(중기업체/가온) 선택 시 회사정보/도장/장비목록 자동 갱신.
- textarea 자동 리사이즈.
- 날짜 자동 포맷.
- 인쇄/PDF/JPG/서명링크 지원.
- 임차인 서명 페이지 있음.

주의:
- Supabase `rental_contracts` 관련 정책/테이블이 필요한 환경이면 SQL 확인 필요.

### 견적서
파일: `src/app/dashboard/estimate/page.tsx`

현재 상태:
- 종류/규격/단위 드롭다운 적용.
- 종류별 규격 동적 목록.
- 인쇄 버튼은 PDF 저장 레이블.
- 인쇄 CSS는 rental-contract와 비슷한 패턴.
- 도장 등록 지원 (2026-08-05 추가):
  - 툴바 도장 드롭다운 — 목록 선택 / 새 도장 등록 / 개별 삭제 / 도장 빼기
  - 크기 24~100px 슬라이더, `estimate_stamp_size`에 저장
  - 문서 내 도장은 `position:absolute` + `pointerEvents:none` (셀 밀림·입력 가림 방지)
  - **글로벌 도장(`ts_stamp`, `ts_stamp_list`)만 사용.** 업체별 도장 금지 — 2장 "도장 오염 방지" 참고
  - 도장 목록은 거래명세서와 공유
- `quote/page.tsx`는 이 페이지와 중복이라 2026-08-05에 삭제됨 (git 이력에 있음).

---

## 5. 장비/업체/비용

### 장비 목록
파일:
- `src/app/dashboard/equipment/EquipmentList.tsx`
- `src/app/dashboard/equipment/SupplierEquipmentModal.tsx`

현재 상태:
- 정기검사/보험만기 날짜 + D-day 두 줄 표시.
- 정기검사는 `inspection_expire + 30일` 기준.
- 보험만기는 원본 날짜 기준.
- 날짜 입력은 `20261102` → `2026-11-02` 자동 포맷.
- 화물차는 `truck` 기준 표시.

### 업체/장비 통합 모달
파일: `src/app/dashboard/equipment/SupplierEquipmentModal.tsx`

주의:
- 신규 업체 등록은 `allowCreate` prop이 있어야 동작.
- 장비 update 시 ownership 절대 포함 금지.
- suppliers update 에러 확인 필수.

### 장비별 투입비용
파일: `src/app/dashboard/equipment-costs/page.tsx`

현재 상태:
- 자차 장비 대상.
- 연/월 또는 연간 + 장비 필터.
- 요약 카드:
  - 배차 매출
  - 급여
  - 주유비
  - 비용(급여 제외)
  - 순이익·이익률
- 매출 계산은 dispatches + daily_logs 슬롯 계산.
- `equipment_id` 또는 차량번호 텍스트 매칭.
- 급여는 비용과 분리.
- 주유비는 expenses의 `category ILIKE '%주유%'` 기간 합계 자동 연동.
- 전체 순이익:
  - 매출 − 급여 − 비용(급여 제외) − 주유비

DB:
- `equipment_costs` 테이블 생성 완료 이력 있음.
- 새 환경이면 GRANT + RLS DISABLE 확인 필요.

---

## 6. Supabase SQL 확인 목록

환경에 따라 아직 안 되어 있을 수 있음.

### 장비별 투입비용
```sql
CREATE TABLE IF NOT EXISTS equipment_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid REFERENCES equipment(id) ON DELETE CASCADE,
  cost_date date NOT NULL,
  category text NOT NULL,
  amount numeric NOT NULL,
  memo text,
  receipt_url text,
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON TABLE equipment_costs TO anon, authenticated;
ALTER TABLE equipment_costs DISABLE ROW LEVEL SECURITY;
```

### 업체 도장 DB 저장
```sql
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS stamp_data TEXT;
```

### 계산서 이미지
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_image_url TEXT;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS invoice_image_url TEXT;
```

### rental_contracts
```sql
CREATE TABLE IF NOT EXISTS rental_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id),
  is_own_equipment BOOLEAN DEFAULT FALSE,
  client_id UUID REFERENCES clients(id),
  equipment_id UUID REFERENCES equipment(id),
  lessor_name TEXT, lessor_business_no TEXT, lessor_ceo TEXT, lessor_address TEXT,
  lessee_name TEXT, lessee_business_no TEXT, lessee_ceo TEXT, lessee_address TEXT,
  equip_name TEXT, equip_reg_no TEXT, equip_model TEXT,
  insurance_yn TEXT DEFAULT '여', inspection_yn TEXT DEFAULT '여', equip_note TEXT,
  site_name TEXT, site_address TEXT, orderer TEXT, contractor TEXT,
  guarantee_yn TEXT DEFAULT '여', site_note TEXT,
  period_start DATE, period_end DATE,
  daily_amount NUMERIC, total_amount NUMERIC,
  working_hours TEXT DEFAULT '1일 8시간 기준, 월 200시간 기준',
  payment_days INTEGER DEFAULT 30,
  lessee_signature TEXT,
  contract_date DATE,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON TABLE rental_contracts TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
```

공개 서명 링크용 정책은 환경별 확인 필요.

---

## 7. 미완료 / 확인 필요 이슈

### 안드로이드 앱/PWA 서류 공유 오류
- 증상:
  - 장비 서류, 거래명세서/임대차계약서 등 파일을 문자 또는 카카오톡으로 공유하려고 하면 안드로이드 앱/PWA에서 공유가 실패하는 경우가 있음.
  - 텍스트 공유가 아니라 **파일 첨부 공유**에서 문제가 나는 케이스.
- 추정 원인:
  - 안드로이드 Web Share API 또는 대상 앱(카카오톡/문자)의 파일 첨부 처리 제한.
  - 카카오톡/문자 앱이 Web Share API로 전달된 Blob/File을 안정적으로 받지 못하는 경우가 있음.
  - 특히 캔버스 캡처 이미지/JPG/PDF Blob을 바로 `navigator.share({ files })`로 넘길 때 실패 가능.
- 다음에 고칠 방향:
  - 사용자 요구사항: 문자 공유는 **그림파일 첨부 공유** 흐름이어야 함.
  - 문자 공유에서 링크 공유/복사/자동 다운로드로 보내지 말 것.
  - JPG/PNG/WebP 같은 이미지 서류만 공유 대상으로 삼을 것.
  - 대안 버튼 제공:
    - 이미지/PDF 다운로드
    - 클립보드 복사
    - 다운로드는 별도 버튼/링크일 때만 동작
  - 사용자 안내 문구: “문자로 공유할 그림파일이 없습니다. JPG/PNG 사진 서류만 문자로 바로 보낼 수 있습니다.”
- 관련 가능 파일:
  - `src/app/dashboard/equipment/EquipmentList.tsx`
  - `src/app/dashboard/equipment/page.tsx`
  - `src/app/dashboard/equipment/SupplierEquipmentModal.tsx`
  - `src/app/dashboard/trade-statement/page.tsx`
  - `src/app/dashboard/rental-contract/page.tsx`
  - JPG/PDF/Web Share API/clipboard/download 처리 함수들

---

## 8. 최근 중요 수정 이력

### 2026-08-05 UX 전면 개선

전 화면 UX 점검 후 `불필요한 요소 삭제 → 중복 통합 → 핵심 행동 강조 → 모바일 개선` 순서로 작업.

#### 공용 헤더 신설 (`src/components/PageHeader.tsx`)
- 목록 화면 9곳의 제각각이던 헤더를 하나로 통일.
- props: `title` / `subtitle` / `primary` / `secondary[]` / `children`
  - `primary`: 파란 솔리드 (데스크탑) + **모바일 우하단 FAB**
  - `secondary`: 중립 아웃라인, `desktopOnly: true`면 모바일에서 숨김 (인쇄 등)
- **모바일에서 `title`은 렌더링 안 됨** — 상단 앱 헤더가 이미 페이지명을 보여줘서 중복이었음.
- 적용: clients, suppliers, EquipmentList, dispatches, daily-logs, invoices, purchase-invoices, expenses, bank

#### 삭제 / 죽은 코드 정리
- `dashboard/quote/page.tsx` 삭제 — `estimate`와 중복인데 메뉴·링크 어디에도 연결 안 돼 있었음.
- `dispatches/page.tsx`: 열리지 않는 `DispatchModal`, 안 읽히는 `logDispatchId`, 세터 미호출 `statusFilter` 제거.
- `layout.tsx`: 동일한 배열 `mgmtHrefList` / `managementHrefs` 중복 제거.

#### 사이드바 (`layout.tsx`)
- 평면 16개 → `배차 업무 / 문서 발행 / 기준 정보` 그룹 + 기존 관리자메뉴.
- `navItems`에 `group` 필드 추가, `GROUP_ORDER`가 표시 순서.
- `managementHrefs`는 `navItems`에서 파생 (하드코딩 배열 아님).
- 메뉴에 없는 경로용 `EXTRA_LABELS` 추가 — 없으면 모바일 헤더에 엉뚱한 메뉴명이 뜸.
- 햄버거/드로어 닫기 버튼 44px, 닫기는 텍스트 `X` → SVG 아이콘.

#### 대시보드 (`dashboard/page.tsx`)
- 순서 변경: 기존 `메모(4줄 textarea) → 세무일정 → 연간이윤 → KPI` 라서 **오늘 배차가 화면 한참 아래** 있었음.
  → `hero → 메모(접힘) → KPI → 통장/관리비 → 최근내역/검사알림 → 연간이윤 → 부가세 → 계산서 → 세무일정`
- 메모장: 기본 접힘 + 첫 줄 미리보기. 세무일정: 기본 접힘, **임박 건 있으면 자동 펼침**.
- 매출/매입 계산서 카드 2개 → 표 1개로 통합 (같은 표가 두 번 반복됐었음).
- 제목 `안녕하세요, 관리자님!` → `오늘 N건 배차중 (자차 N · 타사 N)`.

#### 배차등록 목록 (`dispatches/page.tsx`)
- `전체 / 오늘 / 일보없음` 필터 추가. 일보 미작성 건이 빨간 강조인데 걸러볼 방법이 없었음.
- **주의: 이 페이지는 메뉴에 없음.** 위 "배차등록 메뉴는 일부러 뺀 것" 항목 참고.

#### 견적서 도장 등록 (`estimate/page.tsx`)
- 기존에는 거래명세서에서 등록한 도장을 **읽기만** 하고 등록 수단이 없었음.
- 툴바에 도장 드롭다운 추가: 목록 선택 / 새 도장 등록 / 개별 삭제 / 도장 빼기 / 크기 24~100px.
- 크기는 `estimate_stamp_size`에 저장. 도장은 `position:absolute` + `pointerEvents:none`으로 셀 안 밀림.
- 글로벌 도장만 사용 — 위 "도장 오염 방지" 항목 참고.

#### 모바일
- `globals.css`에 `.touch-list`(터치 44px), `.no-scrollbar`, `.main-scroll`(FAB 가림 방지 하단 여백), `.safe-bottom` 추가.
- 카드 액션 3~4개가 한 줄이라 360px에서 오탭 잦던 화면 → 주요 행동 1줄 전체 + 부수 행동 아래 줄로 분리
  (작업확인서, 장비, 매출/매입계산서).
- 검색바 sticky (발주처/중기업체/장비), 입력창 모바일 `text-base` (iOS 확대 방지).
- `app/layout.tsx`에 `viewportFit: "cover"` — 노치/제스처바 대응.
- 데스크탑 표 래퍼 `overflow-hidden` → `overflow-x-auto`.

#### 참고
- `/dashboard/equipment`, `/dashboard/projects`, `/dashboard/settlements`도 메뉴에 없음.
  동작하는 코드라 삭제하지 않고 `EXTRA_LABELS`에만 등록해둠. 정리 여부는 미결.

### 2026-08-04 수정

#### 전월 버튼 추가 (인디고 색상)
- 배차내역서 (`dispatch-ledger/page.tsx`)
- 거래명세서 (`trade-statement/page.tsx`)
- 관리비 메인 (`expenses/page.tsx`) — 월별 탭에만 표시
- 관리비 엑셀업로드 모달 (`expenses/ExpensesExcelUploadModal.tsx`) — 미리보기 단계에서 날짜 범위 필터 + 전월 버튼
- 장비별 투입비용 (`equipment-costs/page.tsx`)

#### 거래명세서 예금주 누적 버그 수정 (`trade-statement/page.tsx`)
- **원인**: DB에서 supplier 로드 시 `c.bank = bankStr`로 저장 → `bankStr`에 이미 `예금주 :` 포함 → localStorage에 오염된 값 저장 → 다음 로드 때 또 `예금주 :` 붙어서 `::::` 누적
- **수정**: `c.bank = bankBase` (계좌번호만 저장), localStorage 읽을 때 `예금주 :` 이후 문자열 strip 후 state 저장 및 localStorage 덮어씀
- **추가**: 입금계좌 줄 직접 편집 가능 (`<input>` 처리)

#### 매입계산서 지급완료 버튼 즉시 토글 (`purchase-invoices/page.tsx`)
- 기존: 클릭 시 이미지 업로드 다이얼로그 열림
- 수정: 클릭 시 `paid` ↔ `received` 즉시 DB 토글
- `handleMarkPaid(id, currentStatus)` 함수로 변경

#### 통장내역 정산대조 탭 순서 변경 (`bank/page.tsx`)
- 기존: 매칭완료 → 입금미매칭 → 출금미매칭 → 매출미수금 → 매입미지급
- 변경: **매출미수금 → 매입미지급** → 매칭완료 → 입금미매칭 → 출금미매칭

#### 관리비 카테고리 추가 (`expenses/page.tsx`)
- `DEFAULT_CATEGORIES`에 `차량유지비`, `식대&집자재` 추가
- `CATEGORY_COLORS`에 각 색상 추가 (cyan, pink)

#### 매출/매입계산서 월별 합계 테이블 추가 (목록 하단)
- `invoices/page.tsx`: 연도별 1~12월 공급가액·부가세·합계, 맨 아래 합계행 (파란색)
- `purchase-invoices/page.tsx`: 동일, 맨 아래 합계행 (주황색)
- 월 필터 선택 시 해당 연도 기준 / 전체보기 시 올해 기준

#### 대시보드 이번 달 매출/매입계산서 카드 추가 (페이지 하단)
- `page.tsx` 부가세 카드 아래에 매출계산서(파란색) + 매입계산서(분홍색) 나란히
- 각각 공급가액·부가세·합계 표시

#### 매입계산서 "중기업체" → "업체명" 자유 입력 (`purchase-invoices/PurchaseInvoiceModal.tsx`)
- 기존: suppliers 드롭다운 선택만 가능 (중기업체 한정)
- 변경: 텍스트 직접 입력 우선 + 드롭다운 선택 시 자동완성
- DB `purchase_invoices.supplier_name` 컬럼에 저장 (CSV 업로드 때부터 이미 존재)
- `supplier_id` 없이도 저장 가능

### 2026-07-27 정리
- HANDOFF 문서 최신 기준으로 재정리.
- 중복/충돌 내용 압축.
- 최신 배차/일보/대시보드 동작을 상단으로 이동.
- 안드로이드 앱/PWA 장비 서류 공유 오류 대응:
  - 링크 공유 fallback 제거.
  - 자동 다운로드 fallback 제거.
  - 문자 공유는 이미지 파일만 `navigator.share({ files })`로 전달.
  - 장비 목록, 장비 페이지, 중기업체 장비 모달 공유 경로 보강.

### 2026-07-04 전후 배차/일보 수정
- 이전작업 복사 시 차량번호 누락 수정.
- 이전작업 복사 시 운전자 이름 복사.
- 배차등록 임시저장 추가.
- 같은 작업장치 단가 자동 동기화.
- 배차등록 목록 시간/단가 표시 보정.
- 작업확인서 목록 시간대 표시 보정.
- 배차내역서 청구완료 정렬.
- 배차내역서 오늘 날짜 강조.
- 배차등록 앱 카드 오늘 표시.
- 대시보드 오늘 배차 카드에 자차/타사 배차현황 추가.
- `equipment_text` 차량번호 기준 자차 집계 추가.
- 6/30 `002더7599`처럼 서로 다른 배차가 병합되어 시간 수정이 애매해지던 문제 보정.

### 2026-07-17 장비별 투입비용
- `equipment-costs` 페이지 신설.
- 자차 장비별 매출/급여/비용/순이익 계산.

### 2026-07-09 임대차계약서 고도화
- LogModal 통합.
- rental-contract 저장/복사/삭제/서명링크/도장/드롭다운 고도화.

### 2026-07-08 문서/배차/견적서 작업
- 배차 등록 모달 통합.
- 임대차계약서 신설.
- 견적서 드롭다운.
- deploy.bat 구성.

### 2026-07-07 업체/장비/도장 안정화
- SupplierEquipmentModal 공용 버그 수정.
- 자차가 타사로 변질되던 ownership update 문제 수정.
- truck 타입 표시 보정.
- 거래명세서 도장 DB/업체별 분리.
- 모바일 거래명세서 깨짐 수정.

---

## 9. 주요 파일 경로

| 파일 | 설명 |
|---|---|
| `src/components/PageHeader.tsx` | 목록 화면 공용 헤더 (주요/보조 액션 + 모바일 FAB) |
| `src/app/globals.css` | `.touch-list` / `.no-scrollbar` / `.main-scroll` / `.safe-bottom` |
| `src/app/dashboard/page.tsx` | 대시보드 |
| `src/app/dashboard/layout.tsx` | 대시보드 레이아웃/사이드바 |
| `src/app/dashboard/daily-logs/LogModal.tsx` | 배차등록/일보 입력 통합 모달 |
| `src/app/dashboard/daily-logs/page.tsx` | 작업확인서 목록 |
| `src/app/dashboard/dispatches/page.tsx` | 배차등록 목록 |
| `src/app/dashboard/dispatch-ledger/page.tsx` | 배차내역서 |
| `src/app/sign/[logId]/page.tsx` | 작업확인서 서명 페이지 |
| `src/app/dashboard/trade-statement/page.tsx` | 거래명세서 |
| `src/app/dashboard/rental-contract/page.tsx` | 임대차계약서 |
| `src/app/sign/rental/[contractId]/page.tsx` | 임대차계약서 서명 페이지 |
| `src/app/dashboard/equipment/EquipmentList.tsx` | 장비 목록 |
| `src/app/dashboard/equipment/SupplierEquipmentModal.tsx` | 업체/장비 공용 모달 |
| `src/app/dashboard/equipment-costs/page.tsx` | 장비별 투입비용 |
| `src/app/dashboard/estimate/page.tsx` | 견적서 |

---

## 10. 작업 후 응답 템플릿

사용자에게는 짧게:

1. 무엇을 고쳤는지
2. 수정 파일
3. 검사 결과
4. 배포 코드

배포 코드:

```bash
cd C:\Users\mac55\jangbi-platform
vercel --prod
```
