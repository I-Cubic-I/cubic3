# 화면 시험 도구

3D 디지털판(`game/`)을 실제 브라우저(Playwright의 Chromium)로 띄워 스크린샷과 오류를 모은다.

## 준비
- Node.js와 Playwright: `npm i -g playwright` (브라우저가 없으면 `npx playwright install chromium`)
- three.js를 CDN에서 못 받는 환경이면 한 번: `bash tools/test/get-three.sh` → `tools/test/.cache/three.min.js`
  - 다른 위치에 있으면 `THREE_JS=/경로/three.min.js`로 지정

## 실행 (저장소 맨 위에서)
```
node tools/test/play.js flow        # 메인 턴 → 미니게임 뽑기 → 규칙 화면 → ♣ 컷신 → 미니게임
node tools/test/play.js minigames   # 미니게임 8종 테이블
node tools/test/play.js auto        # 한 판 자동 진행(오래 걸림)
node tools/test/play.js p2p         # 두 탭 P2P(?local=1) 방 만들기·들어가기·턴 주고받기
```
결과는 `tools/test/out/`(png, errors.txt). 오류가 있으면 종료 코드 1.

## 구성
- `stub.js`: claude.ai 공유 저장소·로그인을 흉내 내는 대체 코드. 테이블은 메모리에만 있고 사용자는 늘 한 명(`u0`). 한 브라우저 안에서 여러 자리를 조종해 시험할 때 쓴다.
- `play.js`: 빌드 → 작은 로컬 서버로 띄우기 → 시나리오 실행. 시나리오 안에서는 버튼 클릭 대신 `Main.action(...)`을 직접 부르는 곳이 많으니, 클릭이 실제로 닿는지는 따로 확인할 것(예: 숨은 레이어가 클릭을 막던 버그).
- `window.__fast=1`이면 카메라·카드 이동을 즉시 끝낸다(시험용). `flow`는 실제 속도로 본다.
- 헤드리스 Chromium은 애니메이션 프레임이 느리게 돌 수 있어, 움직이는 물건 위치는 잠깐 기다린 뒤 확인한다.
