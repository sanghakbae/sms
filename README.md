# 세일즈 · 영업 관리시스템 (SMS)

거래처 · 영업기회(파이프라인) · 활동 · 실적을 한 곳에서 관리하는 웹앱.

- **프론트엔드**: React 18 + Vite
- **DB**: Cloud Firestore
- **인증**: Google OAuth (`@muhayu.com` 도메인 + 관리자 `qa@muhayu.com`)
- **배포**: GitHub Pages → https://sms.sanghak.kr

## 데이터 계층

```
거래처(customers) ──< 영업기회(deals) ──< 활동(activities)
                         │
                         └ 단계: 리드 → 상담 → 제안 → 협상 → 수주 / 실패
```

- **오퍼튜니티(영업기회)** 는 `deals` 컬렉션에 저장되고 `customerId` 로 거래처에 소속된다.
- 각 딜은 단계별 기본 성공확률(리드 10% … 협상 80%)을 가지며, 대시보드에서 **가중 예상매출**(금액 × 확률)로 집계된다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5182
npm test         # 집계 로직 단위 테스트
npm run build
```

`.env` 에 `VITE_FIREBASE_*` 값이 필요하다(`.env.example` 참고).

### Firebase 콘솔 준비

1. **Authentication → Sign-in method → Google** 활성화
2. **Authentication → Settings → 승인된 도메인** 에 `localhost`, `sms.sanghak.kr` 추가
3. **Firestore → 규칙** 은 `firestore.rules` 배포
   (`firebase deploy --only firestore:rules`)

## 배포

`main` 에 push 하면 `.github/workflows/deploy.yml` 이 GitHub Pages 로 배포한다.
저장소 **Settings → Secrets and variables → Actions → Variables** 에 `VITE_FIREBASE_*` 를 등록해야 빌드에 값이 주입된다.

커스텀 도메인은 `public/CNAME`(= `sms.sanghak.kr`) 로 지정된다.

## 권한 모델

| 대상 | 팀원(`@muhayu.com`) | 팀장(`qa@muhayu.com`) |
|------|:---:|:---:|
| 조회(거래처/딜/활동) | ✅ | ✅ |
| 생성 | ✅ | ✅ |
| 수정·삭제 | 본인 것만 | 전체 |
| 월 매출목표 설정 | — | ✅ |

접근 규칙은 `src/lib/accounts.js` 와 `firestore.rules` 두 곳을 **항상 같게** 유지한다.
