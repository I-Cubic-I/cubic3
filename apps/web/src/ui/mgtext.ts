/* 미니게임 규칙 문안(엔진 MG.text는 실물 카드 뒷면 문안)을 디지털판 화면용으로 거른다.
   실물에서만 필요한 준비(주사위·말 나눠 주기 등)와 말로 하는 부분은 디지털판이 알아서 하므로 적지 않는다 */
import { MG, type MgId } from '@cubic3/engine';

/** 디지털판에서 빼는 항목: 미니게임별 항목 이름 */
const PHYSICAL_ONLY: Partial<Record<MgId, string[]>> = {
  hold: ['준비'],   // 각자에게 주사위 1개를 준다
  count: ['준비'],  // 각자에게 주사위 1개를 준다(답을 보여 줄 주사위)
  race: ['준비'],   // 판 뒷면에 문양 색 말 4개를 둔다
  rps: ['준비'],    // 준비: 없음
};

/** 디지털판에서 고쳐 쓰는 문구: 미니게임별 [실물 문구, 디지털 문구] */
const DIGITAL_WORDS: Partial<Record<MgId, [string, string][]>> = {
  balloon: [['내며 지금까지의 합을 말하고,', '내고,']], // 합은 화면에 나온다
  count: [['(7장 이상이면 6)', '']],                      // 디지털판은 정답이 6장을 넘지 않게 보정한다(엔진 countPan)
};

/** 디지털판 규칙 항목들 [항목 이름, 내용] */
export function digitalRules(id: MgId): [string, string][] {
  const skip = PHYSICAL_ONLY[id] || [];
  let text = MG[id].text;
  for (const [a, b] of DIGITAL_WORDS[id] || []) text = text.replace(a, b);
  return text.split('\n').flatMap(l => {
    const c = l.indexOf(':'); if (c < 0) return [];
    const h = l.slice(0, c).replace(/\(.*\)/, '');
    return skip.includes(h) ? [] : [[h, l.slice(c + 1).trim()] as [string, string]];
  });
}
