#!/usr/bin/env python3
"""3D 디지털판(game/) 빌드: 엔진은 proto/web/index.html 첫 <script>에서 가져와 한 파일로 묶는다.

사용: python3 tools/buildgame.py            -> game/dist/index.html (three.js는 cdnjs)
      python3 tools/buildgame.py --local P  -> three.js를 로컬 파일 P에서 읽는 테스트용 game/dist/local.html
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'

def engine_src():
    html = (ROOT / 'proto/web/index.html').read_text(encoding='utf-8')
    m = re.search(r'<script>\n(/\* =+ 엔진.*?)\nif\(typeof module', html, re.S)
    if not m:
        sys.exit('엔진 블록을 찾지 못했습니다')
    return m.group(1)

def build(three_src, out):
    src = ROOT / 'game/src'
    js = '\n'.join([engine_src()] + [(src / f).read_text(encoding='utf-8') for f in ('net.js', 'scene.js', 'ui.js', 'main.js')])
    css = (src / 'style.css').read_text(encoding='utf-8')
    page = f'''<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>큐빅 파티 3D</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Sans+KR:wght@400;500;700&family=VT323&display=swap">
<style>
{css}
</style>
</head>
<body>
<canvas id="gl" aria-label="게임 테이블"></canvas>
<div id="hud"></div>
<script src="{three_src}"></script>
<script>
{js}
</script>
</body>
</html>
'''
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding='utf-8')
    print('wrote', out, len(page), 'bytes')

if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--local':
        build('file://' + str(pathlib.Path(sys.argv[2]).resolve()), ROOT / 'game/dist/local.html')
    else:
        build(THREE_CDN, ROOT / 'game/dist/index.html')
