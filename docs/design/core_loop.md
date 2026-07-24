# Phase 0 — 설계 고정 (승인: 1A / 2A / 3A)

- 장르: 탑다운 슈팅 액션 로그라이크 고도화
- 성장: 카드 12장
- Director UI: 항상 공개
- 상태: **확정**

---

## 1. 코어 루프

```
이동·사격·대시
  → 적 처치 (XP)
  → 레벨업 시 카드 3택1
  → 방 클리어
  → 클리어 보상(+ pity / no-hit 보너스)
  → 포탈
  → 다음 방
```

한 런 목표 시간: **6~8분**

---

## 2. 런 방 순서 (그래프)

| # | 방 ID | 템플릿 | Director 의도 |
|---|-------|--------|---------------|
| 1 | R1 | Arena | Tutorial / BUILD 진입 |
| 2 | R2 | Corridor | BUILD 압박 |
| 3 | R3 | Cover | SUSTAIN_PEAK |
| 4 | R4 | Fork | Safe vs Elite 분기 (선택 후 RELAX 또는 Peak) |
| 5 | R5 | Spikes | PEAK |
| 6 | R6 | Arena+Elite | SUSTAIN_PEAK |
| 7 | R7 | Boss | Boss Peak (P1–P3) |

소량 랜덤: 적 스폰 위치·소수 지형 오프셋만 허용. 순서 자체는 고정.

---

## 3. Director 상태머신 (L4D식 4단계)

```
BUILD
  → Intensity >= peakThreshold
SUSTAIN_PEAK (최소 3.5초)
  → 최소시간 경과
PEAK_FADE (교전 자연 종료 대기, **spawn/elite 금지**)
  → enemies<=2 또는 fadeTimeout
RELAX (최소 8초 또는 Safe 루트)
  → relax 종료
BUILD
```

### Intensity 입력
- damageTaken recent (4초 윈도우)
- enemyThreat (타입 가중)
- lowHP (1 - hp/max)
- nearMiss

### 상승/하강
- 상승 계수 > 하강 계수 (긴장 잔상)

---

## 4. 플레이스타일 (20초 슬라이딩)

| Style | 신호 | 개입 방향 |
|-------|------|-----------|
| Aggressive | 킬속도↑, 피격 감수 | 원거리/측면 |
| Cautious | 피격↓, 거리유지 | 돌진 압박 |
| Mobile | 이동·대시↑ | 지형 타이트 |

---

## 5. 카드 풀 12장

| ID | 이름 | 효과 |
|----|------|------|
| ATK1 | Overcharge | 공격력 +25% |
| ATK2 | Hollow Point | 치명타 15%(x2) |
| SPD1 | Rapid Coil | 연사 +20% |
| SPD2 | Hot Barrel | 연사 +12%, 이동 -5% |
| SUR1 | Nano Mesh | MaxHP +25 |
| SUR2 | Second Wind | 피격 후 1.2초 추가 i-frame |
| MOB1 | Afterimage | 대시 CD -30% |
| MOB2 | Slipstream | 이동속도 +15% |
| ECO1 | Magnet Core | XP 자석 범위↑ |
| ECO2 | Scavenger | 클리어 보상 pity +1단계 |
| DIR1 | Insight | Director 배너 상세화 + 시작 budget +10 |
| DIR2 | Counterplay | 피격 시 주변 소형 폭발 |

---

## 6. 방 클리어 보상

- 기본 테이블: Heal / Shield / AmmoBoost / CardShard / Nothing
- pity: 연속 Nothing 2회 → 3회차 확정 non-nothing
- No-hit 클리어: 추가 Heal 또는 CardShard

---

## 7. 안 하는 것

- Unity/Unreal 포팅
- 멀티플레이
- 온라인 LLM 필수
- 풀 메타 언락 트리
- 카드 20장 이상 시너지망

---

## 8. Phase 완료 조건

- [x] 루프/방순서/카드풀/상태머신 숫자로 고정
- [x] 비범위 확정
