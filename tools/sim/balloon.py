import random, collections
LIMIT=50
def deck(n): 
    d=[r for r in range(1,14) for _ in range(4)]*(2 if n>=4 else 1); random.shuffle(d); return d
def smart(hand,total):
    safe=[c for c in hand if total+c<=LIMIT]
    if not safe: return min(hand)
    # dump big when far from limit, keep small for later
    return max(safe) if total+max(safe)<=LIMIT-13 else min(safe) if total>=LIMIT-13 else max(safe)
def rnd(hand,total):
    safe=[c for c in hand if total+c<=LIMIT]
    return random.choice(safe or hand)
def game(n,keep,strats):
    d=deck(n); alive=list(range(n)); hands={p:[d.pop() for _ in range(3)] for p in alive}
    order=[]; start=0
    while len(alive)>1:
        total=0; pile=[]; i=start
        while True:
            p=alive[i%len(alive)]
            c=strats[p](hands[p],total); hands[p].remove(c); pile.append(c); total+=c
            if not d: d=pile[:-1]; random.shuffle(d); pile=pile[-1:]
            hands[p].append(d.pop())
            if total>LIMIT:
                idx=alive.index(p); alive.remove(p); order.append(p)
                d+=pile+hands.pop(p); random.shuffle(d)
                start=idx
                if not keep:
                    for q in alive:
                        d+=hands[q]; random.shuffle(d); hands[q]=[d.pop() for _ in range(3)]
                break
            i+=1
    order.append(alive[0]); return order
N=20000
for n in ():
  for keep in (True,False):
    seatwin=collections.Counter(); smartwin=0
    for _ in range(N):
        o=game(n,keep,[smart]*n); seatwin[o[-1]]+=1
        o=game(n,keep,[smart]+[rnd]*(n-1)); smartwin+= o[-1]==0
    print(n,'keep' if keep else 'redraw','seat win%',[round(100*seatwin[s]/N) for s in range(n)],'smart vs random win%',round(100*smartwin/N),'(fair',round(100/n),')')
def bigsafe(hand,total):
    safe=[c for c in hand if total+c<=LIMIT]
    return max(safe) if safe else min(hand)
def smallsafe(hand,total):
    safe=[c for c in hand if total+c<=LIMIT]
    return min(safe) if safe else min(hand)
print('---')
for name,f in ():
  for keep in (True,False):
    w=0
    for _ in range(N):
        o=game(5,keep,[f]+[rnd]*4); w+= o[-1]==0
    print(5,name,'keep' if keep else 'redraw', round(100*w/N))
def reserve(hand,total):
    safe=sorted(c for c in hand if total+c<=LIMIT)
    if not safe: return min(hand)
    if len(safe)>=2 and safe[0]<=3: return safe[-1]  # keep tiny card as reserve
    return safe[-1]
def mid(hand,total):
    safe=sorted(c for c in hand if total+c<=LIMIT)
    if not safe: return min(hand)
    # aim to leave total at 50 exactly or high
    return safe[-1] if total+safe[-1]>=38 else safe[len(safe)//2]
print('--- vs bigsafe field')
for name,f in ():
  for keep in (True,False):
    w=0
    for _ in range(N):
        o=game(5,keep,[f]+[bigsafe]*4); w+= o[-1]==0
    print(name,'keep' if keep else 'redraw', round(100*w/N))
print('--- seat bias, all bigsafe')
for n in (3,5):
  for keep in (True,False):
    c=collections.Counter()
    for _ in range(N): c[game(n,keep,[bigsafe]*n)[-1]]+=1
    print(n,'keep' if keep else 'redraw',[round(100*c[s]/N) for s in range(n)])
