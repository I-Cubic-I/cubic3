# Cubic³

라운드마다 미니게임이 있는 파티형 보드게임. 실물 보드게임과 PC·모바일·웹 버전을 함께 낸다.

큐빅 공방(`I-Cubic-I/cubic-workshop`)의 "라운드 사이 미니게임" 구상을 분리해 새로 설계하는 게임이다. 세공판은 쓰지 않는다.

## 상태

- 기획 단계 (2026-10-08 분리). 정식 제목 **Cubic³** (2026-10-11)
- 메인 게임 규칙 1차안 확정, 미니게임 초안 17개(개인전 풀 확정, 목록은 계속 다듬는 중)
- 디지털판: 3D 시험판을 GitHub Pages(P2P 멀티)로 배포 중. TypeScript + React + Vite + R3F로 전환 예정 (2026-10-11 결정)

## 구조

| 위치 | 내용 |
|---|---|
| `docs/RULES.md` | 규칙 요약서 1차안 (확정 항목을 규칙서 형태로 정리, 빈 곳 점검) |
| `docs/MINIGAMES.md` | 미니게임 초안 |
| `docs/GAME_NOTES.md` | 기획 메모 (확정된 방향과 조건, 시뮬레이션 결과) |
| `docs/OPEN_QUESTIONS.md` | 결정 목록과 상태 |
| `tools/sim/` | 메인 게임 규칙 시뮬레이터 (사용법은 `tools/sim/README.md`) |
| `proto/` | 규칙 시험용 멀티플레이 웹 시험판 (`proto/README.md`) |
| `game/` | 3D 디지털판 (빌드 `tools/buildgame.py`, 설명은 `proto/README.md`) — https://i-cubic-i.github.io/cubic3/ |
| `tools/test/` | 3D판 화면 시험 도구 (Playwright, `tools/test/README.md`) |
