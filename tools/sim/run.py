"""cubic-party 시뮬레이션 실행 예시.

사용법:
    python3 run.py                 # 모드별 기본 비교 (현재 확정 규칙)
    python3 run.py --trials 5000   # 판 수 바꾸기
    python3 run.py --sk catchup_steal

출력 항목
- 평균 라운드와 10~90% 범위
- 연장전 비율, 큐빅 롤까지 간 비율, 교착(40라운드 안에 안 끝남) 비율
- 판 중간 시점의 선두가 우승한 비율(낮을수록 역전이 많음)
- 미니게임 실력 1위(팀은 팀원 합)가 우승한 비율
- ♠K를 쓴 사람(팀)의 우승률과 판당 사용 인원
"""
import argparse
import random
import statistics

import cubicsim as cs

# 현재 확정 규칙의 아이템 단계 투입: J 처음부터, 누군가 첫 토큰 → Q, 누군가 토큰 2개 → K
STAGED = [((11,), None), ((12,), ("first_token",)), ((13,), ("two_tokens",))]

MODES = [
    ("개인 2인", 2, False), ("개인 3인", 3, False), ("개인 4인", 4, False), ("개인 5인", 5, False),
    ("팀 4인", 4, True), ("팀 6인", 6, True), ("팀 8인", 8, True),
]


def batch(n, teams, trials, **kw):
    rounds, ot, roll, stall = [], 0, 0, 0
    lead_t = lead_w = mg_t = mg_w = sk_g = sk_w = 0
    for _ in range(trials):
        g = cs.Game(n, teams=teams, **kw)
        r = g.play()
        rounds.append(r["rounds"])
        ot += r["ot"]
        roll += r["roll"]
        w = r["winner"]
        if w is None:
            stall += 1
            continue
        k = (r["rounds"] + 1) // 2 - 1
        h = g.history[k]
        top = max(h)
        if top > 0 and h.count(top) == 1:
            lead_t += 1
            lead_w += (h.index(top) == w)
        su = [0.0] * g.U
        for i in range(n):
            su[g.unit_of[i]] += g.skill[i]
        mg_t += 1
        mg_w += (max(range(g.U), key=lambda u: su[u]) == w)
        for i in range(n):
            if g.used[i]["♠K"]:
                sk_g += 1
                sk_w += (g.unit_of[i] == w)
    q = statistics.quantiles(rounds, n=10)
    return dict(mean=statistics.mean(rounds), lo=q[0], hi=q[-1], ot=ot / trials, roll=roll / trials,
                stall=stall / trials, lead=lead_w / max(lead_t, 1), mg=mg_w / max(mg_t, 1),
                sk=sk_w / max(sk_g, 1), skn=sk_g / trials)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--sk", default="steal", help="♠K 방식: steal / catchup_steal / destroy / catchup_steal_pay 등")
    ap.add_argument("--no-stages", action="store_true", help="아이템을 처음부터 모두 넣기")
    ap.add_argument("--team4-picks", type=int, default=None, help="팀 4인 1인당 보상 장수 (기본: 시뮬레이터 기본값)")
    args = ap.parse_args()
    random.seed(args.seed)
    print(f"♠K={args.sk}, 아이템 단계 투입={'아니오' if args.no_stages else '예'}, {args.trials}판씩")
    print("모드      | 평균 (10~90%)  | 연장 | 롤  | 교착 | 중간 선두 우승 | 실력 1위 우승 | ♠K 쓴 사람 우승")
    for label, n, teams in MODES:
        kw = dict(skmode=args.sk)
        if not args.no_stages:
            kw["item_stages"] = STAGED
        if teams and n == 4 and args.team4_picks:
            kw["picks"] = args.team4_picks
        d = batch(n, teams, args.trials, **kw)
        base = 1 / (n // 2 if teams else n)
        print(f"{label:8s} | {d['mean']:4.1f} ({d['lo']:.0f}~{d['hi']:.0f}) | {d['ot']:3.0%} | {d['roll']:3.0%} | {d['stall']:3.0%} |"
              f" {d['lead']:3.0%} (기준 {base:.0%}) | {d['mg']:3.0%} | {d['sk']:3.0%} ({d['skn']:.2f}명)")


if __name__ == "__main__":
    main()
