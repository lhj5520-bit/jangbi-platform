# 장비 플랫폼 핸드오프 문서

**프로젝트**: jangbi-platform  
**배포 URL**: https://jangbi-platform.vercel.app  
**Supabase**: https://qeurmytrzghonavsiqwa.supabase.co
**최종 업데이트**: 2026-07-09

---

## ⚠️ 수정 후 필수 — 반드시 이 문구 출력할 것

```
cd C:\Users\mac55\jangbi-platform
vercel --prod
```

---

## ⚠️ 작업자(AI 포함) 필독 주의사항

1. **장비 종류 값은 `truck`이 표준.** DB의 화물차는 전부 `type='truck'`. 화면 표시 맵에는 호환을 위해 `cargo`와 `truck` 둘 다 '화물'로 매핑돼 있음. 새 화면 만들 때 `truck` 누락 금지. (`'excavator' | 'dump' | 'truck'` — src/lib/types.ts)
2. **장비 update 시 `ownership`(자차/타사) 절대 포함 금지.** SupplierEquipmentModal이 중기업체·거래명세서에서는 `ownership="other"` 하드코딩으로 열리므로, update payload에 ownership을 넣으면 자차가 타사로 변질됨. insert에만 포함. (2026-07-07 실제 발생 버그)
3. **SupplierEquipmentModal은 4곳 공용** — 중기업체(신규/수정), 장비자차, 장비타사, 거래명세서 회사정보수정. 수정하면 4곳 모두 영향. 신규 업체 insert는 `allowCreate` prop이 있을 때만 동작. `allowCreate` 없이 업체 미선택이면 글로벌 회사정보(ts_company = 거래명세서 공급자=가온)를 수정하는 모드 — 이 구분을 깨면 가온 정보가 다른 업체 정보로 오염됨.
4. **localStorage 키 규칙**: `ts_company`(글로벌=가온 공급자), `ts_company_sup_{id}`(업체별), `ts_stamp_sup_{id}`(업체별 도장, 글로벌 폴백 금지), `ts_stamp_list`(도장 목록 공용), `ts_last_sup_id`. 도장 원본은 DB(suppliers.stamp_data), localStorage는 캐시.
5. **모바일 축소는 `transform: scale()`, CSS `zoom` 금지.** zoom은 셀 단위 재계산+픽셀 반올림으로 모바일에서 셀 밀림/잘림 발생(거래명세서 실사례). 인쇄/JPG 캡처 시 transform을 'none'으로 리셋 후 복원 (trade-statement 캡처 코드 참고).
6. **문서형 화면 input에는 `width` + `minWidth: 0` 필수.** 미지정 시 브라우저 기본 20글자 폭이 최소 크기가 되는데, 폰 한글 글꼴(Noto Sans)이 PC(맑은 고딕)보다 넓어 PC에선 멀쩡하고 폰에서만 표가 터짐.
7. **Supabase 쓰기 후 error 반드시 확인 + alert.** `const { error } = await ...; if (error) { alert(...); return }` 패턴 유지. 조용히 실패하면 사용자는 저장된 줄 앎.
8. **`typescript.ignoreBuildErrors: true` 유지 중** — 빌드가 타입 오류를 안 잡음. 작업 후 반드시 `npx tsc --noEmit` 직접 실행 (2026-07-07 기준 0건 유지할 것).
9. **createClient()는 `SupabaseClient` 타입 반환** (SSR 중 mock). any로 되돌리면 `.then(({ data }) => ...)` 콜백 전부 암시적 any로 깨짐.
10. **배포는 사용자가 프로젝트 폴더의 `deploy.bat` 더블클릭** (로그: deploy-log.txt). 사용자는 개발자가 아님 — 터미널 명령을 직접 시키지 말고, 수정 후 배포 안내 문구를 항상 출력 (CLAUDE.md 규칙).
11. **모바일 증상은 배포 후에만 재현 확인 가능.** 앱은 PWA — 확인 전 완전 종료 후 재실행. 배포 반영이 의심되면 사이트 HTML의 `dpl_` 배포 ID 변경 여부 확인 (엣지 캐시 때문에 쿼리스트링 붙여서 조회).

---

## 📌 미완료 / 보류 항목

- [ ] **장비별 투입비용 — Supabase SQL 실행 필요** (미실행 시 페이지 진입할 때 안내 알림 뜸):
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
  ```

- [ ] **Supabase SQL 실행 필요 (도장 DB 저장 — 2026-07-07 추가)**:
  ```sql
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS stamp_data TEXT;
  ```
  실행 전까지는 도장이 기존처럼 localStorage에만 저장됨 (기기 간 미동기화, 유실 가능)

- [ ] Supabase SQL 실행 필요:
  ```sql
  ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_image_url TEXT;
  ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS invoice_image_url TEXT;
  ```
- [ ] `purchase_invoices` 테이블에 `paid_at` 컬럼 존재 여부 확인 (없으면 추가)

---

## ✅ [2026-07-09] 완료 작업 (4차 — 임대차계약서 고도화·LogModal 통합)

### dashboard/page.tsx + dispatch-ledger/page.tsx — DispatchModal → LogModal 교체
- 대시보드 `+ 배차 등록` 버튼 클릭 시 기존 DispatchModal(버림) → LogModal로 교체
- dispatch-ledger 신규 배차 버튼도 동일 교체
- LogModal props: `log={null} dispatches={[]} equipment suppliers clients onClose onSaved`
- `dashClients` state + Supabase clients 로드 추가

### dashboard/layout.tsx — 스크롤 버그 수정
- `overflow-y-auto`가 이전 세션 Edit 잘림으로 `overf
low-y-auto`로 분리된 버그 수정
- Python bytes replace로 수정 (Edit 도구 대신)

### rental-contract/page.tsx — 다수 기능 추가 (대규모)

#### textarea 자동리사이즈 (cTA + AR)
- 모든 입력 칸: `<input>` → `<textarea rows={1} onInput={AR} style={cTA}>`
- `cTA`: `resize:none overflow:hidden display:block lineHeight:1.4 minHeight:1.5em`
- `AR` 핸들러: `t.style.height='0'; t.style.height=t.scrollHeight+'px'`
- `useEffect([form])`: 폼 데이터 로드 시 전체 textarea 높이 재계산 (0→scrollHeight)

#### 저장된 계약서 불러오기
- mount 시 `rental_contracts.select('id,contract_date,lessee_name,site_name')` 최신 50건 로드
- 툴바 📂 드롭다운 → 선택하면 `loadContract(id)` 호출 → 전체 폼 복원
- `savedId` state로 신규/수정 구분 (save 시 upsert 패턴)
- 날짜 DB(YYYY-MM-DD) ↔ 화면(YYYY.MM.DD) 변환: `toD()` helper

#### 계약서 복사
- 툴바 📋 복사 버튼 (savedId 있을 때만 표시)
- `saveContract(forceNew=true)` → 강제 INSERT → 새 savedId로 갱신
- `contracts` 목록 상단에 추가

#### 계약서 삭제
- 툴바 🗑 삭제 버튼 (savedId 있을 때만 표시, 빨간색)
- confirm 후 Supabase DELETE → 목록에서 제거 + savedId 초기화

#### 서류 가운데 정렬
- 외부 wrapper: `display:flex justifyContent:center`
- print-area-wrapper: `width: 900*docScale overflow:hidden flexShrink:0`
- 문서가 뷰포트 중앙에 위치

#### 날짜 자동 포맷
- `fmtDate(v)`: 숫자만 추출 → `2026.07.09` 형식 자동 변환
- period_start / period_end / contract_date 의 onBlur에 적용

#### 발주처·임차인 드롭다운 (나.현장 테이블)
- `orderer` 칸: `발주처 선택▼` select + textarea 콤보 (선택 시 textarea 자동입력)
- `contractor` 칸: `임차인 선택▼` select + textarea 콤보
- 인쇄/JPG 시 `className="no-print-sel"` 으로 드롭다운 숨김

#### 임차인(건설업자) 상호 드롭다운
- `lessee_name` sigRow에 `발주처/임차인 선택▼` select 추가
- 선택 시 `selectedClientId` 변경 → useEffect가 lessee 4개 필드 자동입력

#### 임대인(건설기계사업자) 상호 드롭다운
- `lessor_name` sigRow에 중기업체 select 추가 (가온=기본값)
- 선택 시 `selectedSupId` 변경 → useEffect가 lessor 4개 필드 + 도장 + 장비목록 자동갱신

#### 형식(모델명) 우선순위 수정
- `eq.spec ?? eq.model` → `eq.spec ?? eq.model` 유지 (spec이 실제 모델명 필드)
- DB에서 spec이 비면 model로 fallback

#### 도장 위치 수정
- `sigRow` td: `overflow:'visible'` 추가
- 도장 img: `right: -22` (셀 경계 밖으로 살짝 걸침)
- `sigRow` 함수 시그니처: `beforeContent?: React.ReactNode` 파라미터 추가

#### 인쇄/PDF 크기 개선
- `@page { margin: 0 }` (여백 제거로 더 크게 출력)
- `.print-doc { width:210mm padding:8mm box-sizing:border-box }`
- `.print-doc *` 글꼴 13px 강제 (기존 11px → 인쇄 시 더 선명)
- `.print-doc select.no-print-sel { display:none }` — 드롭다운 숨김

#### 가온 도장 크로스디바이스 동기화
- 기존: `localStorage.getItem('ts_stamp')` 만 사용 (다른 기기 미지원)
- 수정: localStorage 도장 있으면 `app_settings` 테이블에 upsert 백업
- 없으면 `app_settings.gaon_stamp` 에서 로드 + localStorage 동기화

#### Supabase SQL 필요 (미실행 시 일부 기능 미작동)
```sql
-- 서명 링크 공개 읽기 (anon 접근 허용)
create policy "public read for sign" on rental_contracts
  for select to anon using (true);

-- 로그인 사용자 계약서 목록 읽기
create policy "auth read" on rental_contracts
  for select to authenticated using (true);

-- 가온 도장 크로스디바이스 저장용 테이블
create table if not exists app_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  key text not null,
  value text,
  unique(user_id, key)
);
alter table app_settings enable row level security;
create policy "own settings" on app_settings
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## ✅ [2026-07-08] 완료 작업 (3차 — 배차등록 통합·임대차 인쇄·견적서 드롭다운)

### deploy.bat 개편
- `git push origin main` + `vercel --prod` 한 번에 실행되도록 통합
- 더블클릭 한 번으로 깃 커밋+푸시+배포 완료

### git-push.bat 신설
- `.git/index.lock` 자동 제거 → `git add -A` → `git commit -m "update"` → `git push origin main`
- 한글 없이 ASCII만 사용 (인코딩 오류 방지)

### dashboard/page.tsx — 배차 등록 모달 통합
- 기존 `/dashboard/dispatches`로 이동하는 링크 버튼 → `DispatchModal` 팝업으로 교체
- "안녕하세요, 관리자님!" 글씨 바로 옆에 **+ 배차 등록** 버튼 배치 (크게)
- `dashEquipment`, `dashSuppliers` state 추가 + 별도 useEffect로 데이터 로드
- `DispatchModal` import: `./dispatches/DispatchModal`

### layout.tsx — 배차 등록 메뉴 제거
- `/dashboard/dispatches` (`배차 등록`) 사이드바에서 제거
- 견적서 항목은 기존 `/dashboard/estimate` 유지

### dispatches/DispatchModal.tsx — large prop 추가
- `large?: boolean` prop 신설: `max-w-lg` → `max-w-2xl` 전환용

### dispatch-ledger/page.tsx — 배차 등록 버튼 추가
- 헤더 버튼 목록 맨 앞에 `+ 배차 등록` 버튼 추가
- `DispatchModal` import + `newDispatchOpen` state + 저장 후 `load()` 호출
- 75KB 대용량 파일 → Edit 도구 대신 Python 문자열 치환으로 수정 (파일 잘림 방지)

### rental-contract/page.tsx — 인쇄 버튼 + 프린트 CSS
- `🖨️ 인쇄` → `📄 PDF 저장` 레이블 변경
- `@media print` CSS 보강:
  - `header, nav, aside { display: none !important }` — 사이드바·모바일헤더 숨김
  - `main, .flex-1 { overflow: visible !important; height: auto !important }` — 스크롤바 제거
  - `::-webkit-scrollbar { display: none !important }` — 웹킷 스크롤바 완전 제거

### estimate/page.tsx — 견적서 규격·단위 드롭다운
- 기존 텍스트 input 3개 → 드롭다운(select)으로 교체
- **종류** (`TYPE_OPTIONS`): 굴삭기 / 덤프트럭 / 화물차 / 기타
- **규격** (`SPEC_OPTIONS`): 종류별 동적 목록
  - 굴삭기: 03LC, 03W, 06W
  - 덤프트럭: 5D/T ~ 25D/T (7종)
  - 화물차: 1T ~ 25T (6종)
  - 기타: 텍스트 직접 입력
- **단위** (`UNIT_OPTIONS`): 시간 / 일대 / 월대 / 식 / 대 / 회
- 종류 변경 시 규격 자동 초기화 (updateRow 로직 개선)
- `🖨️ 인쇄` → `📄 PDF 저장` 레이블 변경
- `@media print` CSS 보강 (rental-contract와 동일 패턴)

### 파일 잘림(truncation) 반복 이슈 주의사항
- Edit 도구는 파일 크기 ~40KB 이상에서 파일 끝을 잘라냄
- **대용량 파일 수정 원칙**: Python `str.replace()` 사용, 수정 후 반드시 파일 끝 확인
- 끝이 잘렸을 경우: `open(path, 'ab').write(tail)` 로 이어붙임
- rental-contract/page.tsx (41KB), dispatch-ledger/page.tsx (75KB) 특히 주의

---

## ✅ [2026-07-08] 완료 작업 (2차 — 임대차계약서 신설)

### src/app/dashboard/rental-contract/page.tsx (신규)
- **건설기계임대차 표준계약서 페이지 신설** (표준약관 제10059호, 2015.10.30 개정)
  - 임대인: 가온건설중기(자차) 또는 중기업체(suppliers) 선택 → 회사정보 자동입력
  - 임차인: 발주처(clients) 선택 → 회사정보 자동입력
  - 장비: 선택한 임대인의 장비 목록 → 자동입력 (건설기계명, 등록번호, 형식, 보험/검사여부)
  - 목적물 표시 테이블(건설기계·현장), 계약조건(사용기간/금액/가동시간/지급시기), 확약문구, 서명란
  - 임대인 서명란 도장 자동표시 (`position: absolute` + `zIndex: 10` 패턴 준수)
  - 모바일 스케일: `transform: scale(docScale)` + `transformOrigin: top left` (zoom 금지 준수)
  - 출력: 🖨️ 인쇄 / 📷 JPG(Web Share API→클립보드→다운로드 우선순위) / 🔗 서명링크
  - 💾 저장: DB upsert → savedId 획득 → 링크 공유 시 자동 저장 트리거
  - 표준약관 전문: "📄 표준약관" 버튼으로 토글 (인쇄 시 2페이지로 출력)
  - 날짜 입력칸: onBlur 자동포맷 (8자리 숫자 → YYYY-MM-DD)
  - 모든 input: `width: 100%` + `minWidth: 0` 적용 (모바일 표 터짐 방지)

### src/app/sign/rental/[contractId]/page.tsx (신규)
- **임차인 서명 페이지** (링크 공유용, 대시보드 없는 독립 페이지)
  - URL: `/sign/rental/{contractId}`
  - 계약 내용 요약 표시 (임대인, 임차인, 기계명, 현장, 금액, 계약일)
  - Canvas 서명: 마우스/터치 모두 지원
  - 제출 → `rental_contracts.lessee_signature` + `signed_at` DB 저장
  - 이미 서명된 경우 완료 화면 표시

### src/app/dashboard/layout.tsx
- 거래명세서 바로 아래에 "임대차계약서" 메뉴 추가 (`/dashboard/rental-contract`, icon: ledger)
- 파일 잘림(truncation) 복구: `</main></div>` + 닫는 태그 누락 부분 복구

### src/app/dashboard/page.tsx
- 파일 잘림(truncation) 복구: 부가세 카드 body(매출세액/매입세액/납부세액 2열 그리드) + 닫는 태그 복구
- tsc --noEmit: 0건 확인

### Supabase SQL 실행 필요 (rental_contracts 테이블 신설)
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

---

## ✅ [2026-07-08] 완료 작업

### dashboard/page.tsx
- **청주시 날씨 위젯 추가**: 헤더 우측에 온도·날씨 상태 표시
  - Open-Meteo API (무료, 키 불필요) / 좌표: 36.6424°N 127.4890°E
  - WMO 날씨코드 → 한국어 변환 (맑음/구름조금/비/눈/천둥번개 등)

### trade-statement/page.tsx
- **입금계좌 중복 표시 제거**: tfoot 행 + 하단 div 두 곳에 표시되던 것을 tfoot만 유지, 하단은 회사명만 표시

### equipment/EquipmentList.tsx + equipment/page.tsx
- **정기검사·보험만기 날짜+D-xx 두 줄 표시**
  - `checkExpire()` 개편: 항상 원본 날짜(회색 xs) + D-xx 배지 두 줄 렌더링
  - 정기검사: `inspection_expire + 30일` 기준 카운트다운
  - 보험만기: 원본 날짜 그대로 카운트다운
  - 만료 시 "만료(N일경과)" 빨간 텍스트, UTC 파싱 버그 수정

### equipment/SupplierEquipmentModal.tsx
- **날짜 입력 포맷 자동화**: 정기검사일·보험만기일 `type="date"` → `type="text"` 변경
  - `fmtDate()` 함수: `onBlur` 시 8자리 숫자 → `YYYY-MM-DD` 자동 변환 (예: `20261102` → `2026-11-02`)
- **도장 업체별 완전 분리**: 모든 경로에서 글로벌 `ts_stamp` 폴백 제거
  - `selectStamp`, `deleteStamp`, `handleSupplierChange`, 초기 useEffect 전부 수정
  - `stampImg` 초기값을 `useState(() => ...)` 동기 로드로 변경 (useEffect 타이밍 이슈 해소)

### trade-statement/page.tsx (도장)
- `onSaved` 콜백: 업체 변경 후 해당 업체 도장(`ts_stamp_sup_${id}`)만 로드, 글로벌 폴백 제거
- 도장 업로드 시 글로벌(`ts_stamp`) + 업체별(`ts_stamp_sup_${id}`) 동시 저장

### git 초기화
- `git init` + remote 연결: https://github.com/lhj5520-bit/jangbi-platform
- 이후 작업 완료 시: `git add -A && git commit -m "..." && git push`

---

## ✅ [2026-07-17] 완료 작업 — 장비별 투입비용 페이지 신설

### 신규: src/app/dashboard/equipment-costs/page.tsx (관리자메뉴)
- 자차 장비 대상. 연/월(또는 연간) + 장비 필터
- 요약 카드: 배차 매출(자동) / 투입비용 / 순이익·이익률
- 장비별 손익 표 + 비용 입력 폼(날짜·장비·항목·금액·메모) + 비용 내역(삭제 가능)
- 항목: 주유비/수리·정비비/보험료/정기검사비/소모품/지입료/기타
- 매출 자동 연동: dispatches+daily_logs 슬롯 계산 (dashboard 연간이윤 로직과 동일), equipment_id 또는 차량번호 텍스트 매칭
- 타입 라벨에 truck/cargo 모두 '화물' 처리
- **Supabase에 equipment_costs 테이블 생성 필요** (미완료 항목의 SQL — 실행 전엔 안내 알림)

### 수정: layout.tsx(navItems+관리자메뉴 목록), settings/page.tsx(권한 경로 목록에 추가)

---

## ✅ [2026-07-07] 완료 작업 (4차 — 업체·장비 통합 모달 버그 일괄 수정)

### 배경
- 중기업체 등록/수정 + 장비(자차) + 장비(타사) + 거래명세서 회사정보수정 = 전부 `SupplierEquipmentModal` 공용. 호출부 prop 차이로 곳곳에서 오동작.

### 수정 1 — 중기업체 신규 등록이 저장 안 되던 버그 (치명적)
- 모달에 suppliers **insert 코드가 없어** "+ 신규 등록"으로 열면 저장 불가
- 신규인데 가온 기본 회사정보가 미리 채워지고, 저장 시 글로벌 `ts_company`(거래명세서 공급자)를 덮어쓰는 오염
- → `allowCreate` prop 신설(suppliers/page.tsx에서 전달). 신규 모드: 빈 폼, 상호 필수 검증, suppliers insert(status:'active'), 선택 도장 함께 저장(localStorage+DB)

### 수정 2 — 자차 장비가 '타사'로 변질되던 버그
- 중기업체·거래명세서 호출부는 `ownership="other"` 하드코딩 → 그 경로에서 기존 장비 수정 저장 시 자차→타사로 덮어써짐
- → 장비 **update payload에서 ownership 제거**, insert에만 포함

### 수정 3 — 화물차 표시 불일치 (truck vs cargo)
- DB는 `truck`(5대), 표시 화면은 `cargo`만 '화물' 인식 → 화물차가 "truck" 그대로 노출
- → 6곳 타입맵에 truck 추가: LogModal(라벨 함수+뱃지), dispatch-ledger, export, dashboard(2곳), trade-statement

### 수정 4 — 저장 실패 무시
- suppliers update 에러 미확인 → 실패 시 alert + 중단하도록 수정

### 수정 파일
- equipment/SupplierEquipmentModal.tsx, suppliers/page.tsx, daily-logs/LogModal.tsx, dispatch-ledger/page.tsx, export/page.tsx, dashboard/page.tsx, trade-statement/page.tsx

### 배포 후 테스트 시나리오
1. 중기업체 → + 신규 등록 → 상호만 입력 후 저장 → 목록에 나타나는지
2. 자차 장비 있는 업체를 중기업체에서 수정 저장 → 장비(자차) 목록에 그대로 있는지
3. 화물차 장비가 작업확인서/배차내역서에서 '화물'로 표시되는지

---

## ✅ [2026-07-07] 완료 작업 (3차 — 거래명세서 도장 문제)

### 증상
1. 거래명세서에서 도장이 셀을 밀고 잘림
2. 업체수정 모달에서 업체를 바꿔도 도장이 안 바뀜 (마지막 저장된 것만 표시)
3. 도장이 수시로 사라짐

### 원인
- (1) 도장 이미지가 상호 셀 안에 일반 요소로 배치되어 행 높이를 밀어냄
- (2)(3) 도장이 **localStorage에만 저장** — 기기/브라우저별로 따로 저장되고, 저장소 정리 시 유실. 업체별 키(`ts_stamp_sup_ID`)가 사라지면 모달이 이전 도장만 표시

### trade-statement/page.tsx
- 상호 행 도장을 `position: absolute`로 변경 — 대표자 이름 위에 겹침, 셀 밀림/잘림 해소
- 초기 로드 시 suppliers.stamp_data(DB) 우선 사용, localStorage는 캐시로 폴백
- 하단 입금계좌/상호 영역 파일 잘림 복구

### equipment/SupplierEquipmentModal.tsx
- 업체 변경 시(모든 경로) 해당 업체 도장으로 자동 동기화하는 useEffect 추가 — DB 우선, 로컬 캐시 갱신
- 로컬에만 도장이 있으면 DB로 자동 마이그레이션 (유실 방지)
- 도장 선택 시 localStorage + suppliers.stamp_data 동시 저장
- 도장 섹션에 "현재 업체에 저장된 도장" 미리보기 추가
- ⚠️ `ALTER TABLE suppliers ADD COLUMN stamp_data TEXT` 실행 필요 (미실행 시 localStorage 동작으로 폴백)

---

## ✅ [2026-07-07] 완료 작업 (3차 — 거래명세서 모바일 앱 화면 깨짐 수정)

### 증상
- 앱(모바일)에서만 거래명세서 도장이 잘리고 셀이 표 밖으로 밀림. PC 브라우저는 정상.

### 원인 (2가지)
1. 모바일 축소가 CSS `zoom` 방식 → 셀 단위 재계산 + 픽셀 반올림으로 셀 밀림/왼쪽 잘림
2. 업태·종목 입력칸에 너비 미지정 → 브라우저 기본 20글자 폭이 최소 크기로 잡힘. 폰 한글 글꼴(Noto Sans)이 PC(맑은 고딕)보다 넓어 오른쪽 패널 전체가 표 테두리 밖으로 밀림 → 대표/도장 잘림

### src/app/dashboard/trade-statement/page.tsx
- 모바일 축소: `zoom: docScale` → `transform: scale()` + `transformOrigin: top left` (레이아웃 통째 축소, 셀 밀림 원천 차단)
- 축소 시 여백 보정: `ResizeObserver`로 문서 높이 측정 → `.print-wrap` 래퍼 높이 = 높이×배율
- 도장: `translateY(-50%)` → 마진 방식 중앙정렬, `zIndex: 10` 추가(다른 셀에 가려짐 방지), right 2px 인셋
- 헤더 입력칸 전부 `width: 100%` + `minWidth: 0` (등록번호/사업장주소/업태/종목)
- 인쇄·JPG·전체다운로드 캡처 시 transform 해제 후 복원 (기존 zoom 리셋과 동일 패턴)

### deploy.bat (신규)
- 폴더에서 더블클릭만으로 `vercel --prod` 배포. 로그는 `deploy-log.txt`에 저장
- 배포하기.bat(한글 인코딩 문제로 실패)은 삭제해도 됨

---

## ✅ [2026-07-07] 완료 작업 (2차 — 전체 코드 오류 검토 및 수정)

### 검토 결과
- `tsc --noEmit`: 오류 12건 발견 → **전부 수정, 현재 0건**
- ESLint: 443건 → 428건 (남은 것은 `no-explicit-any` 405건 + `set-state-in-effect` 23건, 동작 무관 품질/성능 항목)

### src/lib/supabase/client.ts
- `createClient()` 반환 타입을 `SupabaseClient`로 명시 (SSR mock도 `as unknown as SupabaseClient`)
- **타입 오류 10건의 근본 원인** — 반환 타입이 any로 붕괴되어 `.then(({ data }) => ...)` 콜백이 전부 암시적 any였음

### src/app/dashboard/layout.tsx
- 렌더 중 정의되던 `NavLinks` 컴포넌트 → `renderNavLinks()` 일반 함수로 변경
- 리렌더마다 사이드바/드로어 메뉴가 리마운트되어 상태 초기화되던 문제 제거
- 사용처 2곳: `{renderNavLinks()}` (데스크탑), `{renderNavLinks(() => setDrawerOpen(false))}` (모바일 드로어)

### src/app/dashboard/page.tsx
- 렌더 중 `Date.now()` 호출 3곳 제거 → `const [now] = useState(() => new Date())`로 고정
- today/yesterday/prevMonthStart, 정기검사 D-day, 부가세 납부기한 D-day 계산에 `now` 사용
- SSR/클라이언트 하이드레이션 불일치 위험 제거

### src/app/dashboard/bank/UploadModal.tsx + bank/page.tsx
- 경비 자동분류 시 `.filter(Boolean)`이 타입을 좁히지 못해 `null` 섞인 배열이 `insert()`에 전달되던 문제
- `.filter((e): e is NonNullable<typeof e> => e !== null)` 타입 가드로 수정

### src/app/dashboard/daily-logs/LogModal.tsx
- `equipmentTypeLabel` 함수를 컴포넌트 밖(모듈 레벨)으로 이동 (선언 전 접근 해소)
- `effectiveEquipTypeTxt` 선언을 임시저장 useEffect 앞으로 이동
- `let p` 2곳, `let dispatchId` 1곳 → `const`

### src/app/dashboard/vat/page.tsx
- `load()` 함수 선언을 useEffect 앞으로 이동 (선언 전 접근 해소)

### next.config.ts
- Next 16에서 제거된 `eslint: { ignoreDuringBuilds: true }` 옵션 삭제
- `typescript: { ignoreBuildErrors: true }`는 배포 안전을 위해 유지 (tsc 0건이므로 제거 가능하나 보류)

### 남은 항목 (동작 무관, 추후 정리 대상)
- [ ] `@typescript-eslint/no-explicit-any` 405건 — 페이지별 점진 정리
- [ ] `react-hooks/set-state-in-effect` 23건 — effect 내 동기 setState로 인한 이중 렌더 (성능)

---

## ✅ [2026-07-07] 완료 작업

### equipment/EquipmentList.tsx + equipment/page.tsx
- **정기검사 / 보험만기 열 — 날짜+D-xx 두 줄 표시**
  - `checkExpire()` 함수: 항상 실제 날짜(회색 xs) + D-xx 배지 두 줄로 렌더링
  - 정기검사는 `inspection_expire + 30일` 기준 카운트다운
  - 보험만기는 실제 날짜 그대로 카운트다운
  - 음수 처리: `days < 0` → "만료(N일경과)" 빨간 텍스트
  - UTC 파싱 버그 수정: `new Date(dateStr)` → `new Date(y, m-1, d)` 로컬 기준

---

## ✅ [2026-07-06] 완료 작업

### suppliers/page.tsx (중기업체 목록)
- **컬럼 정렬 기능 추가**: 업체명 / 대표자 / 연락처 / 사업자번호 / 계좌번호 헤더 클릭 정렬
- **계좌번호 컬럼 추가**: `bank_name + bank_account` 표시

### clients/page.tsx (발주처 목록)
- **컬럼 정렬 기능 추가**: 업체명 / 대표자 / 연락처 / 사업자번호 / 주소 헤더 클릭 정렬

### equipment/SupplierEquipmentModal.tsx (중기업체 수정 모달)
- **회사 정보 3단계 fallback 로딩**
  1. `ts_company_sup_${id}` (업체별 캐시)
  2. `ts_last_sup_id` 매칭 시 `ts_company` 글로벌
  3. 업체명 매칭 시 글로벌 데이터 자동 마이그레이션
- **DB 정보 자동 병입**: suppliers 테이블의 name/ceo/contact/address/business_no/bank 값을 빈 필드에만 채우고 캐시 저장
- **정기검사일 / 보험만기일 / 보험료** 입력 필드 복구 (모달 재작성 과정에서 누락됐던 것)
- **장비 목록 조회 및 수정**: 기존 장비가 있으면 목록 표시 → 선택 편집 가능, 항상 새로 insert 하던 버그 수정 (`editEquipId` 상태로 update/insert 분기)
- **장비 삭제 시 FK 오류 처리**: 배차 기록 연결 시 "배차 기록이 연결되어 있어 삭제할 수 없습니다" 안내
- **저장 시 suppliers 테이블 업데이트**: `bank_name`, `bank_account`, `bank_holder` 파싱 후 DB 저장
- **`selectedSupId` 위치 수정**: 컴포넌트 최상단으로 이동 (중복 선언 제거, `docRefId` 동적 계산)

### trade-statement/page.tsx (거래명세서)
- **`onSaved` 개선**: 회사정보 저장 시 `ts_company` 글로벌 + `ts_company_sup_${id}` 업체별 키 동시 저장

### public/icons/ (로고 교체)
- 앱·웹 로고를 가온 로고 이미지로 교체 (`logo.png`)
- favicon.ico 재생성: RGBA 변환 후 ICO 포맷 저장 (PNG RGB 포맷 오류 수정)

### equipment/EquipmentList.tsx (정기검사 D-day 표시 수정)
- `checkExpire`: UTC 파싱 버그 수정 (로컬 기준 파싱), 음수 처리("만료(N일경과)") 추가
- 모바일/웹 D-day 불일치 해소

---

## ✅ [2026-07-04] 완료 작업

### daily-logs/LogModal.tsx
- **작업확인서 사진 업로드 기능 추가**
  - `work_image_url` 필드에 이미지 업로드 (Supabase Storage)
  - 업로드 후 미리보기, 탭하면 라이트박스(전체화면) 확대
  - 삭제 버튼으로 사진 제거 가능
  - 임시저장에 `workImageUrl` 포함 (복원 시 사진도 복원)
- **작업명 직접입력 모드 추가** (`directSlots`)
  - 드롭다운에 없는 작업명은 "직접입력" 선택 시 텍스트 입력칸으로 전환
  - 시간대 1·2·3 각각 독립적으로 직접입력 전환 가능
  - ↩ 버튼으로 드롭다운 모드로 복귀 (기본값 '버켓' 복원)

### dispatch-ledger/page.tsx (배차내역서)
- **청구 상태 정렬**: `sortKey = 'invoice_status'`로 청구완료/미완료 기준 정렬
- **오늘 날짜 행 강조**: `log_date === today`인 행에 앰버 배경 + "오늘" 배지

### dispatches/page.tsx (배차등록 목록)
- **오늘 날짜 행 강조**: `start_date === today`인 행에 노란 배경 + "오늘" 배지 (모바일·데스크탑 모두)
- **상태 컬럼 추가**: 진행중 / 완료 배지 표시, 헤더 클릭 시 정렬 가능 (`sortCol = 'status'`)

### dashboard/page.tsx (대시보드 부가세 카드)
- **부가세 카드 본문 레이아웃 개선**: 가로 3분할 → 2열 그리드(매출·매입) + 납부세액 풀폭 카드로 변경
- **부가세 헤더 가독성 개선**:
  - 제목 전체 `text-amber-300` 적용
  - "2026"(연도), "1"(기수) 숫자만 `text-white`로 별도 렌더링 → 어두운 배경에서 뚜렷하게 표시

---

## ✅ [2026-07-02] 완료 작업

## ✅ [2026-07-02] 추가 완료 작업 - 대시보드 UI / 모바일 배차 안정화

### dashboard/page.tsx
- **A 스타일 대시보드 UI 적용**
  - 전체 배경을 웜톤(#f3f0ea)으로 변경
  - 상단 인사 영역을 검정 관제형 헤더 + 앰버 CTA 버튼으로 변경
  - 연간 이윤 분석을 어두운 핵심 패널로 변경
  - 이윤/관리비/이윤율/특정 차량 합계 카드 색상 대비 재조정
- **하단 대시보드 카드까지 스타일 적용**
  - 오늘 배차 / 현재 미수금 / 전월 청구현황 KPI 카드 재작성
  - 통장 잔액 / 당월 관리비 카드에 컬러 헤더 추가
  - 최근 배차 내역 리스트 행 배경·버튼 스타일 변경
  - 정기검사 만료 임박 카드 앰버 헤더형으로 변경
  - 부가세 카드 검정 헤더형으로 변경
- **가독성 수정**
  - 흰 카드 위 흰 글씨 문제 수정
  - 어두운 패널의 보조 텍스트 색상을 밝게 조정
  - 최근 내역 날짜/완료 배지 대비 조정
  - "상체보기" 오타를 "상세보기"로 수정
- **오늘 배차 건수 카드에 자차 배차현황 추가**
  - 오늘 dispatches 조회 시 장비 `ownership`까지 함께 조회
  - 카드 안에 우리 장비(자차) / 타사 장비 건수 표시
  - 자차 배차가 있으면 차량번호와 현장명을 최대 3개까지 미리보기로 표시
  - `equipment_id`가 없어도 `equipment_text`의 차량번호가 자차 장비 목록과 맞으면 자차로 집계

### dashboard/layout.tsx
- **사이드바 메뉴 A 스타일 적용**
  - 이모지 메뉴 아이콘을 기존 SVG 아이콘 기반으로 교체
  - 활성 메뉴를 큰 노란 버튼에서 어두운 선택 배경 + 앰버 아이콘 + 왼쪽 포인트 바 형태로 변경
  - 사이드바 폭 w-64 → w-60으로 조정
  - 업체관리 하위 메뉴를 들여쓰기 + 좌측 라인 구조로 정돈
  - 모바일 드로어도 동일 스타일 적용
- **앱 화면 오른쪽 스와이프 메뉴 열기 개선**
  - 기존 touchstart/touchend 비교 방식에서 touchmove 마지막 좌표 추적 방식으로 변경
  - 오른쪽 55px 이상 + 가로 이동 우세 조건에서 메뉴 열림
  - 왼쪽 스와이프 시 메뉴 닫힘
  - touchcancel 처리 추가

### dashboard/daily-logs/LogModal.tsx
- **장비번호 입력 시 차종 자동 반영**
  - 차량번호가 equipment 테이블과 매칭되면 차종 입력칸에 굴삭기 / 덤프 / 화물 자동 입력
  - 드롭다운 클릭/Enter 선택 시에도 차종, 규격/모델 뱃지, 중기업체, 차주명 자동 연결
  - 공백 제거 후 정확 매칭, 단일 부분 매칭 지원
- **같은 작업장치 단가 자동 동기화 개선**
  - 시간대1 단가 입력/수정 시 시간대2·3의 작업장치가 같고 단가가 비어 있으면 자동 입력
  - 시간대2·3 단가가 기존 시간대1 단가를 따라가던 값이면 시간대1 단가 변경 시 같이 갱신
  - 체크박스를 해제/재체크하지 않아도 기본 버켓 슬롯의 단가가 바로 따라오도록 수정
- **이전작업 복사 시 운전자 이름 복사**
  - 이전 daily_logs에 `driver_name`이 있으면 복사 적용 시 일보 정보의 운전자 이름 칸까지 자동 입력
- **이전작업 복사 시 차량번호 누락 수정**
  - 이전 배차가 `equipment_id`로 저장돼 있어도 장비 객체의 차종/차량번호를 현재 입력칸에 풀어서 복사
  - 복사 후 저장 시 `equipment_text`에 차종+차량번호가 정상 저장되도록 `equipMode`를 직접입력 모드로 고정
- **신규 배차등록 임시저장 기능 추가**
  - 신규 배차등록에서 하나라도 입력하면 localStorage에 자동 임시저장
  - 앱 화면 밀림/모달 닫힘/스와이프 닫힘 후 다시 열면 자동 복원
  - 복원 시 "임시저장된 배차 내용을 복원했습니다." 안내 표시
  - "비우기" 버튼으로 임시저장 삭제 가능
  - 저장 성공 시 임시저장 자동 삭제
  - 기존 배차 수정/기존 일보 수정에는 임시저장 섞이지 않도록 신규 등록에만 적용

### dashboard/daily-logs/page.tsx
- **작업확인서 목록 시간대 표시 보정**
  - 일보에 작업시간이 저장돼 있으면 작업명이 비어 있어도 시간대 행으로 표시
  - 시간대 단가가 비어 있으면 배차 청구단가를 대신 표시
  - 시간 입력 건이 목록에서 `일` / 단가 `-`로 보이던 케이스 보정

### dashboard/dispatches/page.tsx
- **배차등록 목록 시간/단가 표시 보정**
  - 목록 로딩 시 daily_logs의 작업시간/시간대 단가까지 함께 조회
  - 일보에 시간대가 있으면 dispatches의 단위가 `day`여도 목록에서는 `시간`으로 표시
  - 시간대 단가가 있으면 `시간단가` 컬럼에 해당 단가를 우선 표시
- **배차등록 목록 당일 표시**
  - 모바일 앱 카드와 데스크톱 표에서 오늘 배차를 노란 배경과 `오늘` 배지로 표시
  - UTC 날짜 대신 브라우저 로컬 날짜 기준으로 비교해 한국 아침에도 정상 표시

### 검증
- page.tsx, layout.tsx, LogModal.tsx JSX/TypeScript 진단 확인 완료
- 전체 tsc 명령은 환경에서 쓰기 작업으로 분류되어 직접 실행 대신 TypeScript API로 수정 파일 단위 검사 수행

---
### bank/page.tsx
- **입금미매칭 / 출금미매칭** 탭에 체크박스 + 강제처리 버튼 추가
  - `matched_extra_ids = 'forced'` 설정으로 목록에서 제외
  - 행 클릭·전체선택 체크박스 토글 지원
- **매출미수금 / 매입미지급** 탭 강제매칭 버튼 (기존 구현 유지)
- `handleForceMatchPurchases`에서 `paid_at` 제거 (컬럼 미존재 시 실패 방지)
- 파일 잘림(truncation) 복구: 수동 매칭 모달 끝부분 재구성

### dashboard/page.tsx
- **연간 이윤 분석** 카드 추가 (맨 위로 이동)
  - 기준 연도 드롭다운 (2023~2027)
  - 총 매출금액 (driver_name='이영규' 배차건 기준)
  - 총 매출금액 박스: 주유비 금액 + 매출 대비 % 표시
  - 법인관리비 박스: 카테고리별 내역 (금액 큰 순 정렬)
  - 현재 이윤 / 평균 이윤율
  - 002어6110 배차 합계 / (주)제이에이건설 배차 합계 (연도별)
- **보유 장비** KPI 카드 제거 (3칸 그리드)
- 통장잔액 카드에 **통장내역 보기 →** 링크 추가
- `unpaidInvoiceAmt` state 추가 (현재 미수금)
- "전달" → "전월" 텍스트 수정
- 파일 잘림 복구 (null byte 제거 + 끝부분 재구성)

### equipment/EquipmentList.tsx
- 데스크탑 테이블 + 모바일 카드에 **정기검사 / 보험만기** 열 추가
- D-7 이내 빨간색, D-60 이내 노란색 표시

### dispatch-ledger/page.tsx
- 파일 잘림 복구: DispatchEditModal 끝부분 재구성
- **배차내역서 청구 상태 정렬 추가**
  - 표 오른쪽 `청구` 머리글 클릭 시 청구완료 체크/미체크 상태로 정렬
  - 한 번 더 클릭하면 체크된 항목 우선 / 미체크 항목 우선 순서 전환
- **당일 거래일 강조 표시**
  - 거래일이 오늘인 행은 옅은 노란 배경으로 표시
  - 날짜 셀에는 노란 배지와 `오늘` 라벨 표시
- **병합 행 시간 수정 문제 보정**
  - 서로 다른 배차를 날짜+차량번호만으로 한 줄 병합하지 않도록 변경
  - 같은 배차 안의 시간대만 병합해 표시하고, 배차별 수정 대상이 분명하게 보이도록 수정
  - 수정 모달로 시간대3 값도 함께 전달되도록 보완

### trade-statement/page.tsx
- 파일 잘림 복구: tfoot 합계 행 + 입금계좌 영역 재구성

---

## 이윤 계산 로직 (대시보드)

```
총 매출금액 = dispatches WHERE driver_name='이영규'
             → slotAmt(work_price×시간) OR qty×client_unit_price
법인관리비   = expenses 테이블 연도 합계
이윤         = 매출 - 관리비
이윤율       = 이윤 / 매출 × 100
주유비 비중  = category LIKE '%주유%' / 매출 × 100
```

## 강제매칭 패턴 (bank/page.tsx)

| 탭 | 처리 방식 |
|---|---|
| 매출미수금 | `invoices.status = 'paid'` |
| 매입미지급 | `purchase_invoices.status = 'paid'` |
| 입금미매칭 | `bank_transactions.matched_extra_ids = 'forced'` |
| 출금미매칭 | `bank_transactions.matched_extra_ids = 'forced'` |

---

---

## ⚠️ 수정 후 필수 — 반드시 이 문구 출력할 것

```
cd C:\Users\mac55\jangbi-platform
vercel --prod
```

**+ 수정 내용 요약 필수 작성** (어떤 파일, 무엇을 바꿨는지)

---
**최종 업데이트**: 2026-07-01

---

## 완료된 작업

### [2026-07-01] 거래명세서 도장 관리 개선

#### `src/app/dashboard/trade-statement/page.tsx`
- **도장 다중 저장**: 여러 개의 도장 이미지를 이름과 함께 저장 (`localStorage: ts_stamp_list`)
- **회사 정보 수정 모달 내 도장 관리**: 추가·선택(파란 테두리 하이라이트)·삭제를 모달에서 통합 관리
- **툴바 간소화**: 현재 선택 도장 미리보기 + 크기 슬라이더만 표시, 관리는 모달로 이동
- **기존 도장 마이그레이션**: `ts_stamp` 단일 키 → `ts_stamp_list` 배열로 자동 마이그레이션
- **업로드 시 이름 입력**: `prompt()`로 도장 이름 지정 (기본값: 도장1, 도장2, ...)

---

### [2026-06-30] 슬롯 3 / 배차내역서 / 작업확인서 대규모 수정

#### `src/app/dashboard/daily-logs/LogModal.tsx`
- **`use_slot3` 초기화 버그**: `use_slot3: false` 하드코딩 → `!!(_wt3 || log?.work_time_3)` 로 수정 (수정 시 슬롯 3 데이터 사라지던 원인)
- **`equipMode` 리셋 버그**: `useEffect(() => { setEquipMode('text') }, [])` 완전 제거 (건설기계명·차량번호 수정 후 삭제되던 원인)
- **공급가액 계산**: `client_unit_price × totalHours` → `work_price_1/2/3 × 각 슬롯 시간` 합산으로 변경, 슬롯 단가 없을 때만 단가×수량 fallback

#### `src/app/dashboard/daily-logs/page.tsx` (작업확인서 목록)
- **슬롯 3 행 추가**: `work_type_3 / work_time_3 / work_price_3` 있으면 오렌지색 행 표시
- **`totalAmount` fallback**: 슬롯 단가 없을 때 `client_unit_price` 로 대체 (슬롯 1/2/3 모두 적용)

#### `src/app/dashboard/dispatch-ledger/page.tsx` (배차내역서)
- **`LedgerRow` 매핑 누락 수정**: `work_type_3 / work_time_3 / work_price_3` 필드 DB→화면 연결
- **`salesAmount` 계산**: 슬롯별 `parseH(work_time_i) × work_price_i` 합산, 없을 때 `qty × unitPrice` fallback
- **날수 컬럼 제거**: 개별 행의 날수 셀 완전 삭제
- **합계 행 날수 표시**: 거래일 셀 아래 `{filtered.length}일` 추가
- **Export 합계 행**: "64일" → "8일 / 64시간" 형식 수정
- **페이지명 변경**: "배차내역 세부내역서" → "배차내역서"
- **JPG 클립보드 수정**: `setExportVisible(false)` 를 clipboard write 이후로 이동

#### `src/app/sign/[logId]/page.tsx` (작업확인서 서명 페이지)
- **슬롯 3 행 추가**: 작업시간 슬롯 3 표시, 총 시간·금액에 슬롯 3 포함
- **건설기계명 / 차량번호**: `equipment_text` 자유입력 시 "-" 나오던 버그 수정 → 공백 분리 파싱 (마지막 토큰=차량번호, 나머지=기계명)

---

### Supabase 스키마 변경 (이미 실행 완료)
```sql
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS work_type_3 TEXT,
  ADD COLUMN IF NOT EXISTS work_time_3 TEXT,
  ADD COLUMN IF NOT EXISTS work_price_3 NUMERIC;
```

---

### ⚠️ 데이터 재입력 필요
- **002고6004 / 2026-06-30 행**: 구 버그로 슬롯 3 데이터 소실됨
- 배차내역서 → 해당 행 배차수정 → 시간대 3: `17:00~21:00`, 단가: `87,500원` 재입력
- 정상 시 해당 행 12h / 1,050,000원으로 표시되어야 함

---

## 이전 작업 이력

### 배차내역서 (`/dashboard/dispatch-ledger`)

- **엑셀 내보내기** 버튼 추가 (`handleExcelExport`, xlsx 라이브러리)
- **미수액 컬럼 제거** (헤더 + 데이터 셀 + 합계 행)
- **같은 작업유형 병합**: 동일 날짜 + 동일 차량의 여러 배차를 한 줄로 합산
  - 핵심 로직: `Map<string, number>` 기반 그룹핑 (key = `날짜|차번호끝4자리`)
  - 차번호 끝 4자리 추출 — `"002고6004"` = `"6004"`, `"6004"` = `"6004"` 동일 처리
  - 병합 시 차종/차번호/차주명 빈 값은 다른 행에서 보완
- **차종 표시 안되던 문제** 수정: 병합 후 `equipment_type` 빈 경우 다른 행에서 채우기

### 일보 입력 모달 (`/dashboard/daily-logs/LogModal.tsx`)

- **기존 장비 탭 제거**: 직접 입력만 유지 (`equipMode` 항상 `'text'`)
- **장비 자동 완성**: 번호 입력 시 매칭 드롭다운 → 선택 시 차주명 자동 입력
- **드롭다운 키보드 내비**: ↑↓ 화살표, Enter 선택, Escape 닫기
- **드롭다운 선택 시 닫힘** 수정 (`onMouseDown` + `e.preventDefault()`)
- **차번호 수정 저장 안되던 문제** 수정 (`useEffect`가 `equipMode='text'`로 항상 덮어씀)
- **작업명 기본값 '버켓'** (시간대 1·2·3 모두)
- **시간대 3 추가** (17:00~24:00 기본, 미사용 체크박스)
- **시간대별 사용/미사용 체크박스** → 미사용 시 합산에서 제외
- **이전작업복사**: 최대 50건 표시, 중복 제거 로직 제거
- **장비규격 표시**: 드롭다운에서 장비 선택 시 번호 위에 종류·규격·모델 뱃지 표시

### 사이드바 메뉴 (`/dashboard/layout.tsx`)

- 메뉴 순서 변경: **개인사업자관리** → **전체 내려받기** 순서

### 개인사업자관리 (`/dashboard/sole-proprietor`)

- Supabase `GRANT` 권한 추가 필요했음 (RLS 비활성화와 별개):
  ```sql
  GRANT ALL ON TABLE sole_proprietors TO anon, authenticated;
  GRANT ALL ON TABLE sole_proprietor_records TO anon, authenticated;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
  ```
- **헤더 "항목" → "사업장명"** 변경
- **대표자 행**: `business_no` 대신 `ceo_name` 표시 (버그 수정)
- **사업자번호 행**: `business_no` 올바르게 표시
- **헤더 대표자 이름 제거** (업체명만 표시)
- **색상·폰트 통일** (gray-700 기준)

---

## 알려진 이슈 / 미완성 항목

### 배차내역서 두 줄 병합
- 현재 로직: `날짜 + 차번호 끝 4자리`로 그룹핑
- **엣지 케이스**: 같은 날 다른 현장에 같은 차량 2회 배차 시 잘못 병합될 수 있음
- 필요 시 `날짜 + 차번호 + 현장명` 복합키로 전환 검토

### LogModal 장비 자동 채움
- 신규 배차등록에서 차량번호 입력/선택 시 차종과 장비정보 뱃지가 자동 반영되도록 개선 완료
- 기존 일보 수정 화면에서도 번호가 장비 DB와 매칭되면 차종/뱃지 자동 보정됨
- 남은 검토: 장비번호 부분 매칭 결과가 여러 개인 경우에는 사용자가 드롭다운에서 선택해야 함

### 개인사업자관리 모바일 대응
- 현재 데스크탑 크기로 원복된 상태
- 모바일에서 5개 업체 컬럼이 가로 스크롤 필요 (현재 `overflow-x-auto` 적용됨)
- 더 작은 화면 대응 필요 시 `min-w` 줄이기 검토

---

## 주요 파일 경로

| 파일 | 설명 |
|------|------|
| `src/app/dashboard/dispatch-ledger/page.tsx` | 배차내역서 |
| `src/app/dashboard/daily-logs/LogModal.tsx` | 일보 입력/수정 모달 |
| `src/app/dashboard/daily-logs/page.tsx` | 작업확인서 목록 |
| `src/app/sign/[logId]/page.tsx` | 작업확인서 서명 페이지 |
| `src/app/dashboard/trade-statement/page.tsx` | 거래명세서 |
| `src/app/dashboard/sole-proprietor/page.tsx` | 개인사업자 월별 매출 |
| `src/app/dashboard/layout.tsx` | 사이드바 메뉴 |

---

## 배포

```bash
vercel --prod
```
