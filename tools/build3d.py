"""2D 시험판(proto/web/index.html)에 3D 테이블을 덧씌워 proto/web3d/index.html을 만든다.
규칙 엔진과 화면 코드는 2D 쪽 한 곳에서만 고친다."""
import pathlib
root=pathlib.Path(__file__).resolve().parent.parent
src=(root/'proto/web/index.html').read_text()
css=(root/'proto/web3d/src/hud.css').read_text()
js=(root/'proto/web3d/src/scene.js').read_text()
out=src.replace('<title>큐빅 파티 시험판</title>','<title>큐빅 파티 3D</title>',1)
i=out.index('</style>')
out=out[:i]+'\n'+css+out[i:]
out=out.rstrip()+'\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\n'+js+'\n</script>\n'
(root/'proto/web3d/index.html').write_text(out)
print('built',len(out))
