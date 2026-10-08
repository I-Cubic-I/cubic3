"""cubic-party 능력 포함 시뮬레이터 (2026-10-09 확정 규칙 기준, 재작성본).

규칙 요약
- 트럼프 52장(6·8인 팀전은 2벌). A~10 숫자 카드(토큰 재료), J·Q·K 아이템 카드(문양별 능력).
- 시작 손패 2장, 손패 상한 6장.
- 라운드: (아이템 투입 확인) → 선 플레이어부터 메인 턴 → 승리 판정 → 미니게임 → 보상 진열 → 상한 정리 → 선 이동.
- 메인 턴: 아이템 1장까지 + 줍기(덱 맨 위 또는 버림 줄 끝) 후 1장 버리기 + 토큰 만들기 1회.
- 토큰: 같은 문양 숫자 카드 3/4/5장 → 그 색 토큰. 서로 다른 색 3개면 승리. 문양별 토큰 수 = 경주 단위 수.
- 같은 라운드에 여럿이 3색 → 4색 연장전(4번째 비용 3장). 또 겹치면 큐빅 롤(무작위).
- 아이템: 쓰거나 버리면 자기 앞. 카드 미니게임(70%)이 끝나면 버림 줄·자기 앞 카드 모두 덱으로.
- 보상: 개인전은 인원×2+1장 진열, 1인 2장(같은 방향 두 바퀴). 팀전은 인원+1장 진열, 1인 1장.
- 팀전: 2인 1팀, 팀원끼리 나란히, 토큰 팀 공유, 각자 턴마다 토큰 1회, 팀 단위 선 + 라운드마다 팀 내 순서 반전.

능력
♠J 남의 손패 무작위 1장 뺏기 / ♠Q 문양 지목, 있으면 숫자 카드 1장 받기 / ♠K 토큰(skmode로 변형)
♥J ♠ 공격 1회 무효(남의 턴) / ♥Q 버림 줄에서 숫자 카드 2장 회수 / ♥K ♠ 공격 무효 + 되돌림(되돌린 공격은 못 막음)
♦J 덱 위 3장 보고 1장, 나머지는 뽑힌 순서대로 버림 / ♦Q 지금 비용만큼의 같은 문양 숫자 카드로 원하는 색 토큰 (dqmode="recolor"면 옛 효과: 내 토큰 1개를 없는 색으로) / ♦K 이번 토큰 비용 3장
♣ 미니게임 판 조작(측정 불가 → 미니게임 아이템으로만 씀)
미니게임: 아무 아이템 1장 → 성적 +item_boost.

skmode: "steal" 뺏기 / "destroy" 공급처로 되돌리기 / 앞에 "catchup_" = 나보다 토큰이 많은 상대만 / 뒤에 "_pay" = 뺏을 때 손패 2장 버림 / 뒤에 "_dump" = 뺏은 뒤 손패 전부 버림
item_entry: None(처음부터) 또는 ("round", r) / ("first_token",) / ("two_tokens",) → 아이템 전체를 그때 투입
item_stages: [(등급 튜플, 조건 또는 None), ...] → 등급별 단계 투입
"""
import random
from collections import Counter, defaultdict

SUITS = "SHDC"
NAME = {11: "J", 12: "Q", 13: "K"}
SYM = {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}
ALL_ABILITIES = {f"{SYM[s]}{NAME[r]}" for s in SUITS for r in (11, 12, 13)}

def is_num(c): return c[1] <= 10
def is_item(c): return c is not None and not is_num(c)
def cname(c): return f"{SYM[c[0]]}{NAME[c[1]]}" if c[1] > 10 else f"{SYM[c[0]]}{c[1]}"

ITEM_KEEP_VALUE = {
    "♠K": 3.0, "♥K": 2.6, "♠Q": 1.6, "♥J": 1.6, "♥Q": 1.6, "♦K": 1.6,
    "♠J": 1.3, "♦J": 1.2, "♦Q": 1.0, "♣J": 0.7, "♣Q": 0.7, "♣K": 0.9,
}

class Game:
    def __init__(self, n, teams=False, abilities=ALL_ABILITIES, costs=(3, 4, 5), ot_cost=3,
                 start=2, cap=6, item_boost=1.0, card_minigame=0.7, noise=0.2, decks=None,
                 skmode="steal", picks=None, team_token_once=False,
                 item_entry=None, item_method="shuffle", items_per_round=2, item_stages=None, dqmode="color", supply=None):
        self.n, self.teams = n, teams
        self.abil = set(abilities)
        self.costs, self.ot_cost, self.cap = costs, ot_cost, cap
        self.item_boost, self.card_mg, self.noise = item_boost, card_minigame, noise
        self.skmode = skmode
        self.unit_of = [i // 2 for i in range(n)] if teams else list(range(n))
        self.U = n // 2 if teams else n
        self.picks = picks if picks else (1 if teams else 2)  # 팀전은 인원과 관계없이 1인 1장 (2026-10-09)
        self.team_token_once = team_token_once
        self.made_this_round = set()
        self.decks = decks if decks else (2 if n > 5 else 1)
        self.deck = [(s, r) for s in SUITS for r in range(1, 14)] * self.decks
        random.shuffle(self.deck)
        # 아이템 투입
        self.item_entry, self.item_method, self.items_per_round = item_entry, item_method, items_per_round
        self.item_pile = []
        self.items_in = item_entry is None
        self.items_round = 1 if item_entry is None else None
        if item_entry is not None:
            self.item_pile = [c for c in self.deck if not is_num(c)]
            random.shuffle(self.item_pile)
            self.deck = [c for c in self.deck if is_num(c)]
        self.stages = []
        if item_stages:
            later = set()
            for ranks, trig in item_stages:
                if trig is not None: later |= set(ranks)
            for ranks, trig in item_stages:
                if trig is None: continue
                self.stages.append(dict(trig=trig, pile=[c for c in self.deck if c[1] in ranks], done=False, round=None))
            self.deck = [c for c in self.deck if c[1] not in later]
        self.row, self.front = [], []
        self.supply = {s: (min(supply, self.U) if supply else self.U) for s in SUITS}
        self.dqmode = dqmode
        self.tokens = [[] for _ in range(self.U)]
        self.hands = [[self.draw() for _ in range(start)] for _ in range(n)]
        self.skill = [random.gauss(0, 1) for _ in range(n)]
        self.ot = False
        self.marker = 0
        self.stats = defaultdict(int)
        self.used = [Counter() for _ in range(n)]
        self.history = []
        self._payer = None

    # ---------- 기본 도구 ----------
    def draw(self):
        if not self.deck:
            if not self.row and not self.front:
                return None
            self.deck = self.row + self.front
            self.row, self.front = [], []
            random.shuffle(self.deck)
        return self.deck.pop()

    def mates(self, i):
        if not self.teams: return []
        return [j for j in range(self.n) if j != i and self.unit_of[j] == self.unit_of[i]]

    def opponents(self, i):
        return [j for j in range(self.n) if self.unit_of[j] != self.unit_of[i]]

    def goal(self): return 4 if self.ot else 3

    def cost_for(self, u):
        k = len(self.tokens[u])
        return self.ot_cost if k >= 3 else self.costs[k]

    def usable(self, u, s): return self.supply[s] > 0 and s not in self.tokens[u]

    def cnt(self, i, s): return sum(1 for c in self.hands[i] if is_num(c) and c[0] == s)

    def has_ab(self, i, name):
        return name in self.abil and any(is_item(c) and cname(c) == name for c in self.hands[i])

    def take_item(self, i, name):
        for c in self.hands[i]:
            if is_item(c) and cname(c) == name:
                self.hands[i].remove(c); return c
        return None

    def value(self, i, c):
        if c is None: return -9
        if not is_num(c):
            nm = cname(c)
            return ITEM_KEEP_VALUE[nm] if nm in self.abil else 0.5
        u = self.unit_of[i]
        if not self.usable(u, c[0]): return -1
        v = self.cnt(i, c[0])
        for m in self.mates(i): v += 0.5 * self.cnt(m, c[0])
        return v + random.random() * self.noise

    def discard(self, i, c): (self.row if is_num(c) else self.front).append(c)

    # ---------- 토큰 ----------
    def best_suit(self, i, cost):
        u = self.unit_of[i]; best = None
        for s in SUITS:
            k = self.cnt(i, s)
            if k >= cost and self.usable(u, s) and (best is None or k > self.cnt(i, best)): best = s
        return best

    def make_token(self, i, s, cost):
        u = self.unit_of[i]
        used = sorted([c for c in self.hands[i] if is_num(c) and c[0] == s], key=lambda c: c[1])[:cost]
        for c in used: self.hands[i].remove(c); self.row.append(c)
        self.tokens[u].append(s); self.supply[s] -= 1
        self.made_this_round.add(u)

    def try_token(self, i, item_free):
        u = self.unit_of[i]
        if self.team_token_once and u in self.made_this_round: return False, False
        cost = self.cost_for(u)
        s = self.best_suit(i, cost)
        if s:
            self.make_token(i, s, cost); return True, False
        if item_free and self.dqmode == "color" and self.has_ab(i, "♦Q"):
            colors = [t for t in SUITS if self.usable(u, t)]
            src = max(SUITS, key=lambda t: self.cnt(i, t))
            if colors and self.cnt(i, src) >= cost:
                t = max(colors, key=lambda t: self.cnt(i, t))
                self.front.append(self.take_item(i, "♦Q")); self.used[i]["♦Q"] += 1
                used = sorted([c for c in self.hands[i] if is_num(c) and c[0] == src], key=lambda c: c[1])[:cost]
                for c in used: self.hands[i].remove(c); self.row.append(c)
                self.tokens[u].append(t); self.supply[t] -= 1
                self.made_this_round.add(u)
                return True, True
        if item_free and cost > 3 and self.has_ab(i, "♦K"):
            s = self.best_suit(i, 3)
            if s:
                self.front.append(self.take_item(i, "♦K")); self.used[i]["♦K"] += 1
                self.make_token(i, s, 3); return True, True
        return False, False

    # ---------- ♠ 공격과 ♥ 방어 ----------
    def defend(self, attacker, target, kind):
        defenders = [target] + self.mates(target)
        if kind == "♠K":
            for name, res in (("♥K", "reflect"), ("♥J", "block")):
                for d in defenders:
                    if self.has_ab(d, name):
                        self.front.append(self.take_item(d, name)); self.used[d][name] += 1
                        return res
        else:
            for d in defenders:
                if self.has_ab(d, "♥J") and random.random() < 0.5:
                    self.front.append(self.take_item(d, "♥J")); self.used[d]["♥J"] += 1
                    return "block"
        return "none"

    def steal_token(self, thief_u, victim_u):
        if self.skmode.endswith("destroy"):
            if not self.tokens[victim_u]: return False
            s = random.choice(self.tokens[victim_u])
            self.tokens[victim_u].remove(s); self.supply[s] += 1
            return True
        options = [s for s in self.tokens[victim_u] if s not in self.tokens[thief_u]]
        if not options: return False
        s = random.choice(options)
        self.tokens[victim_u].remove(s); self.tokens[thief_u].append(s)
        if "dump" in self.skmode and self._payer is not None:
            p = self._payer
            for c in list(self.hands[p]):
                self.hands[p].remove(c); self.discard(p, c)
        if "pay" in self.skmode and self._payer is not None:
            p = self._payer
            for _ in range(2):
                if self.hands[p]:
                    w = min(self.hands[p], key=lambda c: self.value(p, c))
                    self.hands[p].remove(w); self.discard(p, w)
        return True

    def sk_target_ok(self, u, v):
        ok = bool(self.tokens[v]) if self.skmode.endswith("destroy") else \
            any(s not in self.tokens[u] for s in self.tokens[v])
        if self.skmode.startswith("catchup"):
            ok = ok and len(self.tokens[v]) > len(self.tokens[u])
        return ok

    def attack(self, i, kind):
        u = self.unit_of[i]
        if kind == "♠K":
            units = sorted({self.unit_of[j] for j in self.opponents(i)},
                           key=lambda v: (-len(self.tokens[v]), random.random()))
            targets = [v for v in units if self.sk_target_ok(u, v)]
            if not targets: return False
            tp = random.choice([j for j in range(self.n) if self.unit_of[j] == targets[0]])
        else:
            cand = [j for j in self.opponents(i) if self.hands[j]]
            if not cand: return False
            cand.sort(key=lambda j: (-len(self.tokens[self.unit_of[j]]), -len(self.hands[j]), random.random()))
            tp = cand[0]
        self.front.append(self.take_item(i, kind)); self.used[i][kind] += 1
        res = self.defend(i, tp, kind)
        self.stats[f"{kind}_시도"] += 1
        if res == "block":
            self.stats[f"{kind}_막힘"] += 1; return True
        if kind == "♠K":
            if res == "reflect":
                self.stats["♠K_되돌림"] += 1
                if self.steal_token(self.unit_of[tp], u): self.stats["♠K_되돌림_성공"] += 1
            else:
                self._payer = i
                if self.steal_token(u, self.unit_of[tp]): self.stats["♠K_성공"] += 1
                self._payer = None
            return True
        src, dst = (i, tp) if res == "reflect" else (tp, i)
        if kind == "♠J":
            if self.hands[src]:
                c = random.choice(self.hands[src]); self.hands[src].remove(c); self.hands[dst].append(c)
        else:
            need = max(SUITS, key=lambda s: (self.usable(self.unit_of[dst], s), self.cnt(dst, s)))
            got = [c for c in self.hands[src] if is_num(c) and c[0] == need]
            if got:
                c = random.choice(got); self.hands[src].remove(c); self.hands[dst].append(c)
                self.stats["♠Q_적중"] += 1
        return True

    # ---------- 메인 턴 ----------
    def plan_item(self, i):
        u = self.unit_of[i]
        if self.cost_for(u) > 3 and self.has_ab(i, "♦K") and not self.best_suit(i, self.cost_for(u)) \
                and self.best_suit(i, 3):
            return None
        if self.has_ab(i, "♠K") and (not "pay" in self.skmode or len(self.hands[i]) >= 3):
            if any(self.sk_target_ok(u, self.unit_of[j]) for j in self.opponents(i)):
                if "dump" not in self.skmode:
                    return "♠K"
                # 손패를 다 버리는 대가: 뺏어서 바로 목표에 닿거나, 손패가 별로일 때만 쓴다
                best = max((self.cnt(i, s) for s in SUITS if self.usable(u, s)), default=0)
                if len(self.tokens[u]) + 1 >= self.goal() or best <= 2:
                    return "♠K"
        if self.dqmode == "recolor" and self.has_ab(i, "♦Q"):
            cost = self.cost_for(u)
            for s in self.tokens[u]:
                if self.cnt(i, s) >= cost and any(self.supply[t] > 0 and t not in self.tokens[u] for t in SUITS):
                    return "♦Q"
        if self.has_ab(i, "♥Q"):
            if len([c for c in self.row if is_num(c) and self.value(i, c) >= 1]) >= 2: return "♥Q"
        for kind in ("♠Q", "♠J"):
            if self.has_ab(i, kind):
                lead = max(len(self.tokens[self.unit_of[j]]) for j in self.opponents(i))
                if lead >= len(self.tokens[u]): return kind
        return None

    def use_item(self, i, kind):
        u = self.unit_of[i]
        if kind in ("♠K", "♠Q", "♠J"): return self.attack(i, kind)
        if kind == "♦Q":
            cost = self.cost_for(u)
            for s in list(self.tokens[u]):
                if self.cnt(i, s) >= cost:
                    news = [t for t in SUITS if self.supply[t] > 0 and t not in self.tokens[u]]
                    if not news: return False
                    t = max(news, key=lambda t: self.cnt(i, t))
                    self.front.append(self.take_item(i, "♦Q")); self.used[i]["♦Q"] += 1
                    self.tokens[u].remove(s); self.supply[s] += 1
                    self.tokens[u].append(t); self.supply[t] -= 1
                    return True
            return False
        if kind == "♥Q":
            useful = sorted([c for c in self.row if is_num(c)], key=lambda c: -self.value(i, c))[:2]
            self.front.append(self.take_item(i, "♥Q")); self.used[i]["♥Q"] += 1
            for c in useful: self.row.remove(c); self.hands[i].append(c)
            return True
        return False

    def dj(self, i):
        self.front.append(self.take_item(i, "♦J")); self.used[i]["♦J"] += 1
        seen = [c for c in (self.draw() for _ in range(3)) if c]
        if not seen: return
        best = max(seen, key=lambda c: self.value(i, c))
        seen.remove(best); self.hands[i].append(best)
        for c in seen: self.discard(i, c)

    def pickup(self, i, nxt):
        top = self.row[-1] if self.row else None
        if top is not None and self.value(i, top) >= 1:
            self.row.pop(); self.hands[i].append(top)
        else:
            c = self.draw()
            if c: self.hands[i].append(c)
        if not self.hands[i]: return
        mate_next = nxt is not None and self.unit_of[nxt] == self.unit_of[i]
        def score(c):
            own = self.value(i, c)
            if nxt is None: return own
            other = self.value(nxt, c) if is_num(c) else 0
            return own - 0.6 * other if mate_next else own + 0.4 * other
        d = min(self.hands[i], key=score)
        self.hands[i].remove(d); self.discard(i, d)

    def main_turn(self, i, nxt):
        item_free = True
        kind = self.plan_item(i)
        if kind and self.use_item(i, kind): item_free = False
        made, used = self.try_token(i, item_free)
        if used: item_free = False
        if not made:
            u = self.unit_of[i]; cost = self.cost_for(u)
            if item_free and self.has_ab(i, "♦J") and any(self.cnt(i, s) == cost - 1 and self.usable(u, s) for s in SUITS):
                self.dj(i); item_free = False
            self.pickup(i, nxt)
            self.try_token(i, item_free)
        else:
            self.pickup(i, nxt)

    def order(self, rnd):
        if not self.teams:
            return [(self.marker + k) % self.n for k in range(self.n)]
        seq = []
        for k in range(self.U):
            t = (self.marker + k) % self.U
            a, b = 2 * t, 2 * t + 1
            seq += [a, b] if rnd % 2 == 1 else [b, a]
        return seq

    # ---------- 아이템 투입 ----------
    def hit(self, e, rnd):
        return (e[0] == "round" and rnd >= e[1]) or \
               (e[0] == "first_token" and any(self.tokens)) or \
               (e[0] == "two_tokens" and any(len(t) >= 2 for t in self.tokens))

    def check_items(self, rnd):
        for st in self.stages:
            if not st["done"] and self.hit(st["trig"], rnd):
                st["done"], st["round"] = True, rnd
                self.deck += st["pile"]; random.shuffle(self.deck)
        if self.items_in: return
        if not self.hit(self.item_entry, rnd): return
        self.items_in, self.items_round = True, rnd
        if self.item_method == "shuffle":
            self.deck += self.item_pile; self.item_pile = []
            random.shuffle(self.deck)

    # ---------- 미니게임과 보상 ----------
    def minigame(self):
        perf = []
        for i in range(self.n):
            items = [c for c in self.hands[i] if is_item(c)]
            use = None
            weak = [c for c in items if c[0] == "C" or cname(c) not in self.abil]
            if weak: use = weak[0]
            elif len(items) >= 2: use = min(items, key=lambda c: self.value(i, c))
            p = self.skill[i] + random.gauss(0, 1)
            if use:
                self.hands[i].remove(use); self.front.append(use); p += self.item_boost
            perf.append((p, i))
        perf.sort(reverse=True)
        if random.random() < self.card_mg:
            self.deck += self.row + self.front
            self.row, self.front = [], []
            random.shuffle(self.deck)
        return [i for _, i in perf]

    def reward(self, ranks):
        disp = [c for c in (self.draw() for _ in range(self.picks * self.n + 1)) if c]
        if self.items_in and self.item_method == "display" and self.item_entry is not None:
            for _ in range(min(self.items_per_round, len(self.item_pile))):
                disp.append(self.item_pile.pop())
        for _ in range(self.picks):
            for i in ranks:
                if not disp: break
                c = max(disp, key=lambda c: self.value(i, c))
                disp.remove(c); self.hands[i].append(c)
        for c in disp: self.discard(None, c)

    def trim(self):
        for i in range(self.n):
            while len(self.hands[i]) > self.cap:
                w = min(self.hands[i], key=lambda c: self.value(i, c))
                self.hands[i].remove(w); self.discard(i, w)

    def play(self, max_rounds=40):
        for rnd in range(1, max_rounds + 1):
            self.check_items(rnd)
            seq = self.order(rnd)
            self.made_this_round = set()
            for k, i in enumerate(seq):
                self.main_turn(i, seq[k + 1] if k + 1 < len(seq) else None)
            done = [u for u in range(self.U) if len(self.tokens[u]) >= self.goal()]
            self.history.append([len(t) for t in self.tokens])
            if len(done) == 1:
                return dict(rounds=rnd, winner=done[0], ot=self.ot, roll=False)
            if len(done) >= 2:
                if not self.ot: self.ot = True
                else: return dict(rounds=rnd, winner=random.choice(done), ot=True, roll=True)
            self.reward(self.minigame())
            self.trim()
            self.marker = (self.marker + 1) % (self.U if self.teams else self.n)
        return dict(rounds=max_rounds, winner=None, ot=self.ot, roll=False)
