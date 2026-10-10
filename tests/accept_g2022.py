"""2022 충실판 단위 1~3·5·6의 독립 수용 검사.

근거 경로: _briefs/lanes/2022/{u1-reflect,u2-scene,u3-a11y,u5-cell,u6-pick}.md.
각 함수의 주석에 명세 줄을 적었다. 기대값은 명세·D-68에서 정하며,
구현은 저장 봉투와 기존 UI 선택자를 찾는 데만 참고한다.

해석: 카드 키·문구·후보 우선순위는 고정하지 않는다(u1:14~19의 예).
풍력만 있는 2번 계획은 '풍력에 크게 기대는 계획'이다. 옛 twist 부재는
부재 또는 빈 문자열 4개(pick 포함)로 허용한다. 손상 twist는 빈 문자열로 정규화한다.
태풍 강조는 캡션의 '바닷가 풍력 강조: ….' 절만 검사한다. 전체 배치 목록에는
내륙 풍력이 있어도 된다. 선택 요소는 select 또는 라디오를 모두 허용한다.
빈 칸에는 검사할 글자가 없으므로 대비는 실제 렌더링된 글자만 측정한다.
성찰 타이머는 직전 면접의 25분 표시를 보존한다(기존 공통 흐름 계약).

실행·네 환경·KCP_BASE/KCP_RESULT·마지막 problems: N·콘솔/페이지 오류·
가로 스크롤 집계는 harness.main에 맡긴다. 이 파일 작성 중 브라우저는
실행하지 않는다. 가상 계획과 가상 메모만 사용한다.
"""

import copy
import re

from harness import Ctx, main


KEY = "kcp:v1:2022"
SCENE = "#v2-stage .v2-stage-canvas"
EXAMPLE_CELLS = (
    "F5", "I9", "I7", "B1", "A1", "A2", "A4", "A6", "A7", "B6",
    "F1", "G1", "H1", "I1", "J1",
)
Q1 = {"fossil": "B4", "nuclear": "F2", "solar": "H7", "wind": "H2"}
EMPTY_TWIST = {"k": "", "pick": "", "line": "", "keep": ""}


def _game(q1=None, q2=None, wires=None):
    return {"mode": "q2" if q2 else "q1", "overlay": "map", "tool": "wind",
            "q1": dict(q1 or {}), "r1": {}, "q2": list(q2 or []),
            "q2text": "가상 계획의 공급과 영향을 비교한다.",
            "wireVersion": 2, "wires": list(wires or []), "wireNotice": ""}


def _wind_game():
    # 예시 배치를 쓰지 않는 풍력 전용 계획. D-68: 지형별 전선 제한 없음.
    return _game(q2=[{"type": "wind", "cell": "B5", "to": "참살이"}],
                 wires=[["B5", "B4"], ["B4", "B3"], ["B3", "B2"],
                        ["B2", "C2"], ["C2", "D2"]])


def _mixed_game():
    # u2:22~25, u6:12~16: q1과 다른 2번 혼합 계획. B5 해상, H2 해안, H8 내륙.
    # 원문 지도·생산 규칙: 화석 60, 원자력 90, 풍속 20/10/5, I행 일사량 20.
    return _game(q1=Q1, q2=[
        {"type": "fossil", "cell": "A10", "to": "배멧"},
        {"type": "nuclear", "cell": "B7", "to": "배멧"},
        {"type": "wind", "cell": "B5", "to": "참살이"},
        {"type": "wind", "cell": "H2", "to": "빛가람"},
        {"type": "wind", "cell": "H8", "to": "빛가람"},
        {"type": "solar", "cell": "I8", "to": "빛가람"},
    ], wires=_wind_game()["wires"])


def _seed(c, game, phase="prep", extra=None):
    # 기존 검사와 같이 이전 화면의 지연 저장을 끝내고 주입한다.
    c.goto("#home", wait=".home-grid")
    c.page.evaluate("() => { if (KCP.flush) KCP.flush(); }")
    state = {"phase": phase, "game": copy.deepcopy(game)}
    state.update(extra or {})
    c.page.evaluate("([key,s]) => localStorage.setItem(key,JSON.stringify(s))",
                    [KEY, state])
    c.page.reload()
    c.page.wait_for_selector(".home-grid")
    c.goto("#y2022", wait={"prep": "#grid .cell", "room": ".qdeck .qcard",
                           "reflect": "#nextstep-2022"}[phase])


def _saved(c):
    c.wait_saved(400)
    state = c.ls(KEY)
    c.expect(isinstance(state, dict), "저장 봉투 kcp:v1:2022는 객체")
    return state or {}


def _wire_keys(wires):
    # D-68의 무방향 선분: 끝점·선분의 배열 순서는 보존 계약이 아니다.
    return sorted(":".join(sorted(edge)) for edge in wires)


def _phase(c, phase):
    c.phase(phase)
    c.page.wait_for_selector({"prep": "#grid .cell", "room": ".qdeck .qcard",
                              "reflect": "#nextstep-2022"}[phase])
    c.check(f"2022 {phase}")


def _name(cell):
    # title은 접근성 이름의 대체물로 인정하지 않는다(u3:14).
    return cell.evaluate(r"""el => el.getAttribute('aria-label') ||
      (el.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
      el.textContent.trim()""")


def _active(c):
    return c.page.evaluate("document.activeElement.closest('#grid [data-cell]')?.dataset.cell || null")


def _keyboard(c, selector):
    c.page.locator(selector).focus()
    c.page.keyboard.press("Enter")


def _tab_into_grid(c):
    # 바로 앞의 실제 탭 정지점에서 Tab을 보낸다. 칸 자체를 focus하지 않는다.
    entered = c.page.evaluate("""() => {
      const stops=[...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
        .filter(e=>e.tabIndex>=0 && !e.disabled && e.getClientRects().length &&
          getComputedStyle(e).visibility!=='hidden');
      const i=stops.findIndex(e=>e.closest('#grid'));
      if(i<=0) return false;
      stops[i-1].focus(); return true;
    }""")
    c.expect(entered, "지도 앞의 탭 정지점을 찾는다")
    c.page.keyboard.press("Tab")
    c.expect(_active(c) is not None, "Tab으로 지도 칸에 들어간다")


def _no_examples(c, text, label):
    for coord in EXAMPLE_CELLS:
        c.expect(not re.search(rf"(?<![A-Za-z0-9]){coord}(?![A-Za-z0-9])", text),
                 f"{label}: 학생이 쓰지 않은 예시 좌표 {coord} 없음")


def _questions(c):
    return c.page.evaluate("KCP.games['2022'].questions(KCP.load('2022'))")



def _live_has(c, *parts, timeout=1000):
    # u3 4번: 알림은 role=status 영역에 들어가면 된다. 같은 문구를 반복해도 낭독되게 구현이
    # 비운 뒤 다음 프레임에 쓰므로(g2022.js announce), 즉시 읽지 않고 1초 안에 나타나는지 본다.
    try:
        c.page.wait_for_function("""p => { const t=document.querySelector('#grid-live')?.textContent||'';
          return p.every(x => t.includes(x)); }""", arg=list(parts), timeout=timeout)
        return True
    except Exception as exc:
        if type(exc).__name__ != "TimeoutError":
            raise
        return False

def _caption(c):
    return c.page.locator(SCENE).get_attribute("aria-label") or ""


def _scene_text(c):
    # Canvas 조언도 DOM 캡션과 함께 검사한다. 최근 drawImage 이후의 글자만.
    drawn = c.page.evaluate("window.__g22DrawText || []")
    return _caption(c) + " " + " ".join(drawn)


def _scene_plan(c, number, cells, absent=(), question=None):
    # u2:20,33: 전환 후 2초 이내. 허용 문구는 '1번' 또는 '문제 1'.
    args = {"sel": SCENE, "number": number, "cells": list(cells),
            "absent": list(absent), "question": question}
    matched = True
    try:
        c.page.wait_for_function("""a => {
          const text=document.querySelector(a.sel)?.getAttribute('aria-label') || '';
          const plan=new RegExp(a.number+'\\\\s*번|문제\\\\s*'+a.number);
          const coordinate=x=>new RegExp('(^|[^A-Za-z0-9])'+x+'(?![A-Za-z0-9])');
          return plan.test(text) && a.cells.every(x=>coordinate(x).test(text)) &&
            a.absent.every(x=>!coordinate(x).test(text)) &&
            (a.question===null || new RegExp('질문\\\\s*'+a.question+'(?![0-9])').test(text));
        }""", arg=args, timeout=2000)
    except Exception as exc:
        # 타임아웃만 단언 실패로 바꾸고 다른 도구 오류는 harness에 남긴다.
        if type(exc).__name__ != "TimeoutError":
            raise
        matched = False
    c.expect(matched, f"2초 안에 장면이 {number}번 계획·현재 질문을 설명: {_caption(c)}")


def _cards(c):
    c.page.wait_for_selector("#tw22")
    return c.page.locator("#tw22 [data-tw22]").evaluate_all(
        "els => els.map(e=>({k:e.dataset.tw22,text:e.textContent}))")


def _caption_has(c, patterns, label):
    # u2:20,30: 2초 동안 캔버스 이름 자체를 기다린다(고정 sleep·별도 캡션 대체 없음).
    matched = True
    try:
        c.page.wait_for_function("""a => {
          const text=document.querySelector(a.sel)?.getAttribute('aria-label') || '';
          return a.patterns.every(p=>new RegExp(p).test(text));
        }""", arg={"sel": SCENE, "patterns": patterns}, timeout=2000)
    except Exception as exc:
        if type(exc).__name__ != "TimeoutError":
            raise
        matched = False
    c.expect(matched, f"{label} 2초 안에 캔버스 이름에 질문 대상·강조: {_caption(c)}")


def _pick_controls(c):
    # u6:12,17: 빈 option은 미선택이며, 라디오는 checked가 없어야 한다.
    return c.page.locator('#tw22 select#tw22-pick, #tw22 select[name="tw22-pick"], '
                          '#tw22 input[type="radio"]#tw22-pick, '
                          '#tw22 input[type="radio"][name="tw22-pick"]')


def _picked(c):
    return _pick_controls(c).evaluate_all("""els=>els.filter(e=>
      e.tagName==='SELECT' || e.checked).map(e=>e.value).filter(Boolean)""")


def t_A1_grid_roles_navigation_and_install(c: Ctx):
    # u3:13~16,23,25,27: 역할, roving tabindex, 이동, 설치, 알림, 포커스.
    c.goto("#y2022", wait="#grid .cell")
    grid = c.page.locator('#grid [role="grid"]')
    c.eq(grid.count(), 1, "A1 준비실 지도 role=grid 한 개")
    c.expect(bool(grid.get_attribute("aria-label") or grid.get_attribute("aria-labelledby")),
             "A1 지도에 접근성 이름")
    c.eq(grid.locator('[role="columnheader"]').count(), 10, "A1 열 머리 열 개")
    c.eq(grid.locator('[role="rowheader"]').count(), 10, "A1 행 머리 열 개")
    c.eq(grid.locator('[role="gridcell"]').count(), 100, "A1 지도 칸 100개")
    rows = grid.locator('[role="row"]').evaluate_all(
        "els=>els.map(e=>e.querySelectorAll('[role=gridcell]').length).filter(n=>n>0)")
    c.eq(rows, [10] * 10, "A1 각 데이터 행에 gridcell 열 개")
    c.eq(c.page.locator('#grid [tabindex="0"]').count(), 1, "A1 지도 탭 정지점 한 개")
    _keyboard(c, '[data-tool="wind"]')
    _tab_into_grid(c)
    c.page.keyboard.press("Control+Home")
    c.eq(_active(c), "A1", "A1 Ctrl+Home 지도 처음")
    for key, target in (("ArrowRight", "A2"), ("ArrowDown", "B2"),
                        ("Home", "B1"), ("End", "B10"),
                        ("Control+Home", "A1"), ("Control+End", "J10"),
                        ("ArrowRight", "J10"), ("ArrowDown", "J10"),
                        ("ArrowLeft", "J9"), ("ArrowUp", "I9"),
                        ("Control+End", "J10")):
        c.page.keyboard.press(key)
        c.eq(_active(c), target, f"A1 {key} → {target}")
        c.eq(c.page.locator('#grid [tabindex="0"]').count(), 1, "A1 이동 후 탭 정지점 한 개")
    c.page.keyboard.press("Enter")
    plant = c.page.locator('#grid .cell[data-cell="J10"] .plant')
    c.eq(plant.count(), 1, "A1 Enter로 풍력 설치")
    c.eq(_active(c), "J10", "A1 설치 후 다시 그려도 J10 포커스")
    live = c.page.locator("#grid-live")
    c.eq(live.get_attribute("role"), "status", "A1 지도 알림 role=status")
    c.eq(live.get_attribute("aria-live"), "polite", "A1 지도 알림 aria-live=polite")
    c.expect(_live_has(c, "J10", "풍력"), "A1 알림에 좌표와 설치 설비")
    cell = c.page.locator('#grid .cell[data-cell="J10"]')
    c.expect(all(s in _name(cell) for s in ("J10", "바다", "풍력")),
             "A1 접근성 이름에 좌표·지형·발전소")
    c.expect(c.page.get_by_role("gridcell", name=re.compile(r"J10.*풍력|풍력.*J10")).count() == 1,
             "A1 접근성 이름으로 설치 칸을 찾는다")
    c.expect(cell.evaluate("e=>getComputedStyle(e).outlineStyle!=='none' && parseFloat(getComputedStyle(e).outlineWidth)>0"),
             "A1 포커스 윤곽 유지")
    c.page.keyboard.press("Tab")
    c.eq(_active(c), None, "A1 Tab 한 번으로 지도 밖으로 이동")
    _keyboard(c, '[data-ov="wind"]')
    _tab_into_grid(c)
    c.eq(_active(c), "J10", "A1 겹쳐 보기 재그리기 후 마지막 칸 유지")
    # Enter 외에 Space 설치·지우기도 기존 도구와 같은 결과여야 한다.
    _keyboard(c, '[data-tool="erase"]')
    _tab_into_grid(c)
    c.page.keyboard.press("Space")
    c.eq(plant.count(), 0, "A1 Space로 지우개 동작")
    c.expect(_live_has(c, "J10"), "A1 지우기 알림에 좌표")
    c.check("A1 키보드 지도")


def t_A2_keyboard_wire_and_escape(c: Ctx):
    # u3:15~16,24; D-68: 인접 무방향 선분 배열 세 개.
    c.goto("#y2022", wait="#grid .cell")
    _keyboard(c, '[data-mode="q2"]')
    _keyboard(c, '[data-tool="wire"]')
    _tab_into_grid(c)
    c.page.keyboard.press("Control+Home")
    c.page.keyboard.press("Enter")
    c.expect(_live_has(c, "A1"), "A2 전선 시작점 알림")
    c.expect("시작점" in _name(c.page.locator('#grid [data-cell="A1"]')),
             "A2 시작점 접근성 이름")
    for _ in range(3):
        c.page.keyboard.press("ArrowRight")
    c.eq(_active(c), "A4", "A2 키보드로 끝점 A4 이동")
    c.page.keyboard.press("Enter")
    c.eq(_active(c), "A4", "A2 전선 재그리기 후 끝점 포커스")
    wires = _saved(c).get("game", {}).get("wires", [])
    c.eq(_wire_keys(wires),
         ["A1:A2", "A2:A3", "A3:A4"], "A2 A1→A4 인접 선분 세 개 저장")
    c.expect("전선" in _name(c.page.locator('#grid [data-cell="A2"]')),
             "A2 칸 이름에 전선 연결")
    c.page.keyboard.press("Enter")  # A4에서 새 시작점
    c.page.keyboard.press("Escape")
    c.expect(_live_has(c, "취소"), "A2 Esc 취소 알림")
    c.expect("시작점" not in _name(c.page.locator('#grid [data-cell="A4"]')),
             "A2 Esc 후 시작점 표시 제거")
    c.page.keyboard.press("ArrowDown")
    c.page.keyboard.press("Enter")  # 취소했으므로 B4는 끝점이 아니라 새 시작점
    c.expect("시작점" in _name(c.page.locator('#grid [data-cell="B4"]')),
             "A2 Esc 후 다음 Enter는 새 시작점")
    c.eq(_saved(c).get("game", {}).get("wires"), wires, "A2 취소 뒤 전선 추가 없음")
    c.check("A2 키보드 전선")


def t_A3_sizes_and_readonly_examples(c: Ctx):
    # u3:17~18,26~27: 내부 스크롤 허용, 페이지 스크롤 금지, 예시는 읽기 전용.
    _seed(c, _game(q1=Q1))
    boxes = c.page.locator("#grid .cell[data-cell]").evaluate_all(
        "els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})")
    c.eq(len(boxes), 100, "A3 경계 상자를 측정할 지도 칸 100개")
    if c.cfg.mobile:
        c.expect(all(w >= 44 and h >= 44 for w, h in boxes), "A3 390px 지도 칸 모두 44×44 이상")
        tools = c.page.locator("#prep-body [data-tool],#prep-body [data-ov],#prep-body [data-mode]")
        sizes = tools.evaluate_all("els=>els.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height)")
        c.expect(bool(sizes) and min(sizes) >= 44, "A3 390px 설치·겹쳐 보기·탭 높이 44px 이상")
        _tab_into_grid(c)
        c.page.keyboard.press("Control+End")
        c.expect(c.page.locator('#grid [data-cell="J10"]').evaluate("""e=>{
          const r=e.getBoundingClientRect(), w=e.closest('.gridwrap').getBoundingClientRect();
          return r.left>=w.left-1 && r.right<=w.right+1 && r.right<=innerWidth;
        }"""), "A3 좁은 지도에서 마지막 칸 포커스가 보이게 내부 스크롤")
    else:
        c.expect(c.page.locator("#grid .mgrid").evaluate("""e=>{
          const r=e.getBoundingClientRect(), w=e.closest('.gridwrap').getBoundingClientRect();
          return r.left>=w.left-1 && r.right<=w.right+1 && r.right<=innerWidth;
        }"""), "A3 데스크톱 지도 전체가 가로로 잘리지 않음")
    c.expect(c.page.evaluate("document.documentElement.scrollWidth<=innerWidth"), "A3 페이지 가로 스크롤 없음")
    c.check("A3 준비실 지도")
    _phase(c, "reflect")
    c.page.click("#skipEx")
    examples = c.page.locator("#phase .gridwrap .mgrid")
    c.expect(examples.count() >= 2, "A3 성찰 예시 지도 표시")
    for i in range(examples.count()):
        ex = examples.nth(i)
        c.eq(ex.locator('[tabindex="0"]').count(), 0, "A3 예시 지도 탭 정지점 없음")
        c.eq(ex.get_by_role("button", include_hidden=True).count(), 0, "A3 예시 지도 버튼 역할 없음")
        c.eq(ex.locator("button").count(), 0, "A3 예시 지도 실제 버튼 없음")
        c.expect(ex.get_attribute("role") in ("img", "table"), "A3 예시 지도 이미지 또는 표 의미")
        if ex.get_attribute("role") == "img":
            c.expect(bool(ex.get_attribute("aria-label")), "A3 예시 지도 요약 이름")
    c.check("A3 성찰 예시 지도")


# 실제 텍스트 노드의 부모 색과 조상 배경을 alpha 합성한다. 배경 이미지의
# 픽셀 색은 계산 스타일이 아니므로 포함하지 않는다(브라우저 시각 확인 대상).
CONTRAST = r"""sels => {
  const rgb=s=>{const m=s.match(/^rgba?\(([^)]+)\)$/); if(!m) throw Error('색 형식: '+s);
    const a=m[1].split(',').map(Number);return [a[0],a[1],a[2],a.length>3?a[3]:1]};
  const over=(a,b)=>[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3]));
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4})
    .reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const out=[];
  for(const sel of sels){
    const cell=document.querySelector(sel);if(!cell) continue;
    const walk=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
    while(walk.nextNode()){
      const text=walk.currentNode.textContent.trim(), el=walk.currentNode.parentElement;
      if(!text || !el.getClientRects().length || getComputedStyle(el).visibility==='hidden') continue;
      const chain=[];for(let e=el;e;e=e.parentElement) chain.unshift(e);
      let bg=[255,255,255];for(const e of chain) bg=over(rgb(getComputedStyle(e).backgroundColor),bg);
      const color=getComputedStyle(el).color, fg=over(rgb(color),bg), a=lum(fg),b=lum(bg);
      out.push({sel,text,color,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
    }
  }return out;
}"""


def t_A4_names_and_contrast_samples(c: Ctx):
    # u3:14,19,25: 바다·육지·호수·마을·발전소 × 겹쳐 보기 4종 × 두 테마.
    q1 = dict(Q1, wind="G6")  # 호수에도 실제 발전소 글자가 있는 표본
    _seed(c, _game(q1=q1))
    for coord, terrain, extra in (("A3", "바다", "고래"), ("C3", "육지", "산악"),
                                   ("G6", "호수", "풍력"), ("D2", "육지", "참살이"),
                                   ("B4", "육지", "화석")):
        name = _name(c.page.locator(f'#grid [data-cell="{coord}"]'))
        c.expect(all(s in name for s in (coord, terrain, extra)), f"A4 {coord} 좌표·지형·지물/설비 이름")
    samples = [f'#grid [data-cell="{x}"]' for x in ("A3", "C3", "G6", "D2", "B4", "F2", "H7")]
    for ov in ("map", "solar", "wind", "current"):
        c.page.locator(f'[data-ov="{ov}"]').click()
        if ov != "map":
            sea_name = _name(c.page.locator('#grid [data-cell="A3"]'))
            c.expect({"solar": "일사량", "wind": "풍속", "current": "해류"}[ov] in sea_name,
                     f"A4 {ov} 값의 접근성 이름")
            if ov == "wind":
                c.expect("풍" in sea_name and re.search(r"남|북|동|서", sea_name), "A4 풍향을 말로 읽는다")
        readings = c.page.evaluate(CONTRAST, samples)
        c.expect(bool(readings), f"A4 {ov} 실제 글자 대비 표본 존재")
        if ov == "map":
            c.expect(set(samples) <= {r["sel"] for r in readings}, "A4 지도 보기의 모든 지형·설비 표본에 실제 글자")
        for r in readings:
            c.expect(r["ratio"] >= 4.5,
                     f"A4 {c.cfg.scheme}/{ov} {r['sel']} {r['text']!r} "
                     f"{r['color']} / {r['bg']} 대비 {r['ratio']:.3f} ≥4.5")
        c.check(f"A4 대비 {ov}")


def t_B1_shared_frozen_map_data(c: Ctx):
    # u2:14,29,34: 지도 자료 단일화, 깊은 동결, 사본 상수·예시 호출 금지.
    c.goto("#y2022", wait="#grid .cell")
    source = c.page.evaluate("""async () => {const r=await fetch('ui/stage-2022.js');
      return {status:r.status,text:await r.text()}}""")
    c.eq(source["status"], 200, "B1 장면 소스 fetch 성공")
    code = re.sub(r"/\*.*?\*/|//[^\n]*", "", source["text"], flags=re.S)
    for name in ("TERR", "WIND", "FEAT", "WDIR", "SOLAR", "ROWS", "VILL", "CURR"):
        c.expect(not re.search(rf"\bconst\s+{name}\b", code),
                 f"B1 명세에서 금지한 const {name} 지도 상수 없음")
    c.expect("reflectExtra" not in code, "B1 장면이 성찰 예시를 호출하지 않음")
    _no_examples(c, code, "B1 장면 소스")
    before = c.page.locator("#grid [data-cell]").evaluate_all("els=>els.map(e=>e.getAttribute('aria-label')||e.textContent)")
    data = c.page.evaluate("""() => {
      const d=KCP.games['2022'].model?.data;
      if(!d)return {exists:false};
      const frozen=x=>!x || typeof x!=='object' || (Object.isFrozen(x)&&Object.values(x).every(frozen));
      const before=JSON.stringify(d), deep=frozen(d);
      const attack=x=>{if(!x || typeof x!=='object')return;for(const k of Object.keys(x)){
        if(x[k] && typeof x[k]==='object')attack(x[k]);else try{x[k]='손상 시험';}catch(e){}
      }try{x.extra='손상 시험';}catch(e){}};
      attack(d);
      return {exists:true,keys:Object.keys(d),deep,unchanged:before===JSON.stringify(d)};
    }""")
    c.expect(data["exists"], "B1 model.data 공개")
    if data["exists"]:
        c.expect(set(("ROWS", "TERR", "FEAT", "VILL", "SOLAR", "WIND", "WDIR", "CURR")) <= set(data["keys"]),
                 "B1 명세의 지도 자료 여덟 종류")
        c.expect(data["deep"], "B1 model.data와 모든 중첩 객체 동결")
        c.expect(data["unchanged"], "B1 수정 시도 뒤 공개 자료 불변")
    c.page.evaluate("KCP.rerender()")
    after = c.page.locator("#grid [data-cell]").evaluate_all("els=>els.map(e=>e.getAttribute('aria-label')||e.textContent)")
    c.eq(after, before, "B1 수정 시도가 원본 준비실 지도에 영향 없음")
    c.check("B1 지도 자료")


def t_B2_scene_follows_cards_and_peer(c: Ctx):
    # u2:15~20,22~23,27,29~30,33: mode와 무관하게 현재 질문을 따른다.
    c.page.add_init_script("""(() => {
      window.__g22DrawText=[];
      const p=CanvasRenderingContext2D.prototype, text=p.fillText, image=p.drawImage;
      p.drawImage=function(...args){
        if(this.canvas.matches?.('#v2-stage .v2-stage-canvas')) window.__g22DrawText=[];
        return image.apply(this,args);
      };
      p.fillText=function(...args){
        if(this.canvas.matches?.('#v2-stage .v2-stage-canvas')) {
          window.__g22DrawText.push(String(args[0]));
          if(window.__g22DrawText.length>500)window.__g22DrawText.shift();
        }
        return text.apply(this,args);
      };
    })();""")
    game = _wind_game()
    game["q1"] = dict(Q1)
    _seed(c, game)
    baseline = _saved(c).get("game", {})
    _phase(c, "room")
    qs = _questions(c)
    indices = {q["k"]: i for i, q in enumerate(qs)}
    _scene_plan(c, 1, Q1.values(), ["B5"], question=1)  # 마지막 준비실 탭은 q2
    for key, number, cells, absent in (("22-q1", 1, Q1.values(), ["B5"]),
                                       ("22-q2", 2, ["B5"], Q1.values())):
        i = indices[key]
        c.page.locator(".qdeck .qcard").nth(i).click()
        _scene_plan(c, number, cells, absent, question=i + 1)
        _no_examples(c, _scene_text(c), "B2 질문 장면 캡션·Canvas 조언")
    # focusin도 클릭과 같은 현재 질문 변경 경로다(u2:17).
    c.page.locator('textarea[data-a="0"]').focus()
    _scene_plan(c, 1, Q1.values(), ["B5"], question=1)
    c.page.locator("#pv-open").click()
    c.page.wait_for_selector("#pv-view")
    c.expect(c.page.locator("#room-alt").is_visible() and c.page.locator("#room-main").is_hidden(),
             "B2 면접위원 보기 활성화")
    for i in range(len(qs)):
        if i:
            c.page.locator("#pv-next").click()
        key = qs[i]["k"]
        number = 1 if key.startswith("22-q1") else 2
        _scene_plan(c, number, Q1.values() if number == 1 else ["B5"], question=i + 1)
        _no_examples(c, _scene_text(c), "B2 면접위원 장면 캡션·Canvas 조언")
    saved = _saved(c).get("game", {})
    c.eq(set(saved), set(baseline), "B2 현재 질문·포커스 같은 새 game 키를 저장하지 않음")
    c.eq(saved, baseline, "B2 질문 전환이 준비실 계획·전선·mode를 바꾸지 않음")
    c.check("B2 면접위원 장면")
    _phase(c, "reflect")
    _phase(c, "room")
    _scene_plan(c, 1, Q1.values(), ["B5"], question=1)


def t_B3_unprepared_question_has_empty_scene(c: Ctx):
    # u2:18,22~26: 다른 문제의 계획을 빈 문제에 대신 그리지 않는다.
    for game, empty_key, number, other_cells in (
        (_game(q1=Q1), "22-q2", 2, list(Q1.values())),
        (_wind_game(), "22-q1", 1, ["B5"]),
    ):
        _seed(c, game, "room")
        qs = _questions(c)
        i = next(i for i, q in enumerate(qs) if q["k"] == empty_key)
        c.page.locator(".qdeck .qcard").nth(i).click()
        _scene_plan(c, number, [], other_cells, question=i + 1)
        caption = _caption(c)
        c.expect("준비실" in caption and "계획" in caption and
                 bool(re.search(r"세우지|없|비어", caption)), "B3 이 문제의 계획이 없다는 설명")
        _no_examples(c, caption, "B3 빈 문제의 장면")
        c.check(f"B3 {empty_key} 빈 장면")


def t_B4_room_scene_not_broken_with_motion(c: Ctx):
    # 독립 검토 결함 1(총괄 추가): 움직임 켬 + 화석 발전소 + 면접실에서 첫 rAF 시각이 장면 생성보다
    # 앞서 ctx.t가 음수가 되면 drawSmoke가 배열 밖을 읽어 장면이 깨졌다. 여러 번 열어도 깨지지 않아야 한다.
    for n in range(3):
        _seed(c, _game(q1=Q1), "room")
        c.page.wait_for_timeout(1200)
        broken = c.page.evaluate("()=>({b:!!document.querySelector('#v2-stage.v2-stage-broken'), e:String(KCP.v2.lastError||'')})")
        c.expect(not broken["b"], f"B4 면접실 장면이 깨지지 않음({n + 1}회) {broken['e'][:80]}")


def t_C1_twist_wind_result_order_and_export(c: Ctx):
    # u1:13~15,21~23,25~27,30~31,33: 패널, 수치, 메모, 내보내기, 비노출.
    _seed(c, _wind_game(), "reflect")
    cards = _cards(c)
    before_condition = _saved(c).get("game", {})
    c.expect(2 <= len(cards) <= 4, "C1 후속 조건 카드 2~4개")
    c.expect(c.page.locator("#tw22 .tag-mine").filter(has_text="연습실 질문").count() >= 1,
             "C1 조건 패널에 연습실 질문 표시")
    c.expect(c.page.locator("#tw22").evaluate("""e=>{
      const next=document.querySelector('#nextstep-2022').closest('.panel');
      return e.parentElement===next.parentElement && !!(e.compareDocumentPosition(next)&Node.DOCUMENT_POSITION_FOLLOWING);
    }"""), "C1 다음 연습에서 바꿀 한 가지 패널 앞·같은 열")
    wind = [item for item in cards if re.search(r"바람|풍력|풍속", item["text"])]
    c.expect(bool(wind), "C1 풍력 전용 계획에 바람 조건 카드")
    if not wind:
        return
    dimensions = c.page.locator("#tw22 [data-tw22]").evaluate_all(
        "els=>els.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})")
    c.expect(all(w >= 44 and h >= 44 for w, h in dimensions), "C1 조건 카드 조작 44×44 이상")
    c.page.locator("#tw22 [data-tw22]").filter(has_text=re.compile(r"바람|풍력|풍속")).first.click()
    result = c.page.locator("#tw22-result")
    c.eq(result.get_attribute("role"), "status", "C1 결과 숫자 영역 role=status")
    c.expect(bool(re.search(r"부족[^\d]{0,30}\d|\d[^\n]{0,15}부족", result.inner_text())),
             "C1 바람 조건 결과에 부족분 숫자")
    chosen = _saved(c).get("game", {}).get("twist", {}).get("k")
    c.expect(isinstance(chosen, str) and bool(chosen), "C1 고른 카드 키 문자열 저장")
    for field, label in (("line", "내 계획 한 줄 수정"), ("keep", "바꾸지 않는다면 그 이유")):
        c.expect(c.page.get_by_label(re.compile(label)).count() == 1, f"C1 {field} 입력 label")
        maximum = c.page.locator(f"#tw22-{field}").get_attribute("maxlength")
        c.expect(maximum is not None and 1 <= int(maximum) <= 140, f"C1 {field} 짧은 입력 제한(140자 이내)")
    memo = 'C5에 태양광을 추가한다. </textarea><b data-g22-injection>가상 메모</b>'
    keep = "환경 영향을 비교한 뒤 유지 여부를 정한다."
    plan_before = _saved(c).get("game", {})
    c.page.fill("#tw22-line", memo)
    c.page.fill("#tw22-keep", keep)
    saved = _saved(c).get("game", {})
    c.eq(saved.get("twist"), {"k": chosen, "pick": "", "line": memo, "keep": keep},
         "C1 twist 문자열 네 필드 저장(u6:15 미선택 pick 포함)")
    c.eq({k: v for k, v in saved.items() if k != "twist"},
         {k: v for k, v in plan_before.items() if k != "twist"}, "C1 조건 계산·메모가 기존 계획을 바꾸지 않음")
    c.eq({k: v for k, v in saved.items() if k != "twist"},
         {k: v for k, v in before_condition.items() if k != "twist"}, "C1 카드 선택 전후 계획·전선 불변")
    c.page.reload()
    c.page.wait_for_selector("#tw22-line")
    c.eq(c.page.input_value("#tw22-line"), memo, "C1 새로고침 후 한 줄 수정 보존")
    c.eq(c.page.input_value("#tw22-keep"), keep, "C1 새로고침 후 유지 이유 보존")
    c.eq(c.page.locator("#tw22 [data-g22-injection]").count(), 0, "C1 사용자 입력은 HTML 요소로 해석하지 않음")
    c.page.evaluate("""() => {window.__g22clip=null;
      Object.defineProperty(navigator,'clipboard',{configurable:true,
        value:{writeText:text=>{window.__g22clip=text;return Promise.resolve()}}});} """)
    c.page.click("#copyAll")
    c.page.wait_for_function("window.__g22clip!==null || document.querySelector('#copyFallback-2022')", timeout=2000)
    copied = c.page.evaluate("window.__g22clip ?? document.querySelector('#copyFallback-2022')?.value ?? ''")
    c.expect(all(s in copied for s in ("조건이 바뀐다면", "연습실 질문", memo, keep)), "C1 답안 복사에 조건 절·두 메모 포함")
    recap = c.page.evaluate("JSON.stringify(KCP.games['2022'].recap(KCP.load('2022')))")
    c.expect(memo not in recap and keep not in recap and "조건이 바뀐다면" not in recap,
             "C1 후속 메모는 준비실 recap에 섞이지 않음")
    _no_examples(c, c.page.inner_text("#tw22"), "C1 조건 패널")
    # 예시를 연 뒤에도 새 패널이 예시 좌표를 끌어오지 않는다(u1:27).
    c.page.click("#skipEx")
    _no_examples(c, c.page.inner_text("#tw22"), "C1 예시 공개 뒤 조건 패널")
    c.check("C1 조건 성찰")


def t_C2_twist_candidates_fallback_and_stale(c: Ctx):
    # u1:14~20,24,30: 발전원별 후보, q1 대체, 빈 계획, 옛 메모 보존.
    _seed(c, _wind_game(), "reflect")
    wind_cards = _cards(c)
    wind_keys = {x["k"] for x in wind_cards}
    c.page.evaluate("KCP.rerender()")
    c.eq(_cards(c), wind_cards, "C2 같은 계획의 카드·순서는 결정적")
    candidate_sets = [wind_keys]
    for kind, coord, pattern in (("fossil", "B4", r"화석|탄소"),
                                  ("solar", "H7", r"태양광|일사|장마"),
                                  ("nuclear", "F2", r"원자력|보호구역|주민")):
        _seed(c, _game(q2=[{"type": kind, "cell": coord, "to": ""}]), "reflect")
        cards = _cards(c)
        keys = {x["k"] for x in cards}
        candidate_sets.append(keys)
        c.expect(2 <= len(cards) <= 4, f"C2 {kind} 카드 2~4개")
        c.expect(keys != wind_keys, f"C2 {kind} 유무에 따라 풍력 계획과 카드 집합이 다름")
        c.expect(any(re.search(pattern, x["text"]) for x in cards), f"C2 {kind} 관련 조건 카드")
        _no_examples(c, c.page.inner_text("#tw22"), f"C2 {kind} 패널")
    c.expect(len({frozenset(x) for x in candidate_sets}) >= 2, "C2 최소 두 계획에서 다른 카드 집합")
    _seed(c, _game(q1={"solar": "H7"}), "reflect")
    c.expect(any(re.search(r"태양광|일사|장마", x["text"]) for x in _cards(c)), "C2 2번이 비면 1번 배치로 카드 생성")
    _seed(c, _game(), "reflect")
    c.eq(len(_cards(c)), 0, "C2 두 계획이 비면 조건 카드 없음")
    c.page.locator("#tw22").get_by_role("button", name=re.compile("준비실")).click()
    c.page.wait_for_selector("#grid .cell")
    c.eq(_saved(c).get("phase"), "prep", "C2 빈 계획의 버튼으로 준비실 이동")
    _seed(c, _wind_game(), "reflect")
    c.page.locator("#tw22 [data-tw22]").filter(has_text=re.compile(r"바람|풍력|풍속")).first.click()
    c.page.fill("#tw22-line", "공급이 적은 마을부터 다시 확인한다.")
    c.page.fill("#tw22-keep", "환경 영향을 비교할 기준은 유지한다.")
    old = _saved(c).get("game", {}).get("twist")
    changed = _game(q2=[{"type": "solar", "cell": "H7", "to": ""}])
    changed["twist"] = old
    _seed(c, changed, "reflect")
    c.expect(old["k"] not in {x["k"] for x in _cards(c)}, "C2 계획 변경으로 옛 바람 카드가 후보에서 빠짐")
    c.eq(c.page.input_value("#tw22-line"), old["line"], "C2 후보가 바뀌어도 수정 글 보존")
    c.eq(c.page.input_value("#tw22-keep"), old["keep"], "C2 후보가 바뀌어도 유지 글 보존")
    c.expect("이 메모를 쓸 때의 조건" in c.page.inner_text("#tw22"), "C2 옛 메모의 조건 설명")
    c.check("C2 후보·옛 메모")


def t_C3_twist_legacy_and_corrupt_saves(c: Ctx):
    # u1:23,32: 옛 저장/손상 저장도 오류 없이 열고 문자열 검증·보존.
    sentinel = {"memo": "가상 공통 메모", "answers": {"0": "가상 답변"},
                "rubric": {}, "timer": {"of": "answer", "mode": "real",
                                          "running": False, "left": 1490, "total": 1500}}
    cases = [("옛 저장", None), ("숫자 twist", 5),
             ("손상 키·입력", {"k": "zzz", "line": 3}),
             ("잘못된 키·유효 글", {"k": "zzz", "line": "가상 수정", "keep": "가상 이유"})]
    for label, twist in cases:
        game = _wind_game()
        if twist is not None:
            game["twist"] = twist
        start_errors = len(c.rec["pageerrors"])
        _seed(c, game, "reflect", sentinel)
        _cards(c)
        normalized = c.page.evaluate("KCP.games['2022'].model.normalizeGame(KCP.load('2022').game)")
        expected = dict(EMPTY_TWIST)
        if label == "잘못된 키·유효 글":
            expected.update(line="가상 수정", keep="가상 이유")
        if twist is None:
            c.expect("twist" not in normalized or normalized["twist"] == expected,
                     "C3 옛 저장의 twist 부재 또는 빈 기본값")
        else:
            c.eq(normalized.get("twist"), expected, f"C3 {label} 명세대로 정규화")
        saved = _saved(c)
        if twist is not None:
            c.eq(saved.get("game", {}).get("twist"), expected, f"C3 {label} 화면 저장값도 정규화")
        c.eq(len(c.rec["pageerrors"]), start_errors, f"C3 {label} 페이지 오류 0")
        for field in ("q1", "r1", "q2", "q2text", "wireVersion"):
            c.eq(saved.get("game", {}).get(field), game[field], f"C3 {label} 기존 {field} 보존")
        c.eq(_wire_keys(saved.get("game", {}).get("wires", [])), _wire_keys(game["wires"]),
             f"C3 {label} 기존 무방향 전선 보존")
        for field, value in sentinel.items():
            c.eq(saved.get(field), value, f"C3 {label} 공통 {field} 보존")
        c.check(f"C3 {label}")


def t_D1_real_flow_timer_and_report_questions(c: Ctx):
    # u1:27; u2:19; 공통 규칙 src:report; AUDIT §3.2·§8.3 실전 30+25.
    _seed(c, _wind_game())
    c.page.click("#tset")
    c.page.click('[data-tm="real"]')
    c.page.click("#tset")
    c.eq(c.page.inner_text("#clock"), "30:00", "D1 실전 준비 30분")
    c.eq(c.page.inner_text("#tlabel"), "준비", "D1 준비 타이머 라벨")
    c.page.click("#tgo")
    c.page.wait_for_timeout(1200)
    c.expect(c.page.inner_text("#clock") != "30:00", "D1 준비 타이머 실제 경과")
    c.page.click("#tgo")
    c.page.click("#treset")
    c.eq(c.page.inner_text("#clock"), "30:00", "D1 준비 시간 초기화")
    c.page.click("#go22")
    c.page.wait_for_selector(".qdeck .qcard")
    c.eq(c.page.inner_text("#clock"), "25:00", "D1 면접 25분")
    c.eq(c.page.inner_text("#tlabel"), "답변", "D1 면접 타이머 라벨")
    qs = _questions(c)
    c.eq([q["k"] for q in qs if q.get("src") == "report"], ["22-q1", "22-q2"],
         "D1 보고서 문항은 22-q1·22-q2 두 개")
    c.eq(c.page.locator(".qdeck .qcard > .who .tag-official").count(), 2, "D1 보고서 문항 공식 태그 두 개")
    c.page.fill('textarea[data-a="0"]', "가상 계획의 근거를 설명한다.")
    c.check("D1 면접실")
    c.page.click("#toReflect")
    c.page.wait_for_selector("#tw22")
    c.eq(_saved(c).get("phase"), "reflect", "D1 성찰 이동이 막히지 않음")
    c.eq(c.page.inner_text("#clock"), "25:00", "D1 성찰에서 직전 답변 타이머 표시 보존")
    c.eq(c.page.inner_text("#tlabel"), "답변", "D1 성찰 타이머 라벨")
    c.check("D1 성찰")


def t_E1_question_target_highlights(c: Ctx):
    # u2:20~25,27,30: 후속·발산·인문 질문의 대상과 수치도 캔버스 이름으로 읽힌다.
    game = _mixed_game()
    _seed(c, game, "room")
    indices = {q["k"]: i for i, q in enumerate(_questions(c))}
    # D-68: 발전 15+15+2+2+2+2=38, 무방향 공유 전선 5칸, 총비용 43.
    cases = (
        ("22-q1-nuc", 1, [r"원자력[^.]*\bF2\b[^.]*강조"]),
        ("22-q1-fos", 1, [r"화석[^.]*\bB4\b[^.]*강조"]),
        ("22-div-typhoon", 2, [r"바닷가\s*풍력\s*강조\s*:[^.]*\bB5\b",
                                r"바닷가\s*풍력\s*강조\s*:[^.]*\bH2\b",
                                r"바닷가\s*풍력\s*강조\s*:(?![^.]*\bH8\b)[^.]*\."]),
        ("22-hum-vote", 2, [r"빛가람[^.]*강조"]),
        ("22-hum-future", 2, [r"(?:배멧[^.]*참살이|참살이[^.]*배멧)[^.]*강조"]),
        ("22-q2-cost", 2, [r"전선[^.]*강조", r"전선\s*5\s*칸(?!\d)",
                           r"총비용\s*43(?!\d)"]),
    )
    for key, number, patterns in cases:
        c.expect(key in indices, f"E1 {key} 질문 존재")
        if key not in indices:
            continue
        i = indices[key]
        c.page.locator(".qdeck .qcard").nth(i).click()
        _caption_has(c, [rf"질문\s*{i + 1}(?!\d)", *patterns], f"E1 {key}")
        cells = Q1.values() if number == 1 else [p["cell"] for p in game["q2"]]
        _scene_plan(c, number, cells, question=i + 1)
        if key == "22-div-typhoon":
            # 전체 배치 목록에는 H8이 있어야 한다. 강조 절에만 H8이 없어야 한다.
            focus = re.search(r"바닷가\s*풍력\s*강조\s*:\s*([^.]+)\.", _caption(c))
            c.expect(focus is not None, "E1 태풍의 강조 대상 절 존재")
            if focus:
                targets = set(re.findall(r"\b[A-J](?:10|[1-9])\b", focus[1]))
                c.eq(targets, {"B5", "H2"}, "E1 해상·해안 풍력만 강조하고 내륙 H8은 제외")
        c.check(f"E1 {key} 장면 강조")


def t_E2_gridcell_html_and_space_scroll(c: Ctx):
    # u5:14~18: ARIA in HTML의 button/gridcell 위반 제거, 키보드·탭 계약 유지.
    # A1~A4는 그대로 두고 별도로 구조·Space의 페이지 스크롤을 검사한다.
    _seed(c, _wind_game())
    grid = c.page.locator('#grid [role="grid"]')
    c.eq(grid.count(), 1, "E2 준비실 grid 한 개")
    c.eq(grid.locator('button[role="gridcell"]').count(), 0, "E2 button의 금지된 gridcell 역할 0개")
    cells = grid.locator('[role="gridcell"]')
    c.eq(cells.count(), 100, "E2 gridcell 100개")
    c.eq(grid.locator('[tabindex="0"]').count(), 1, "E2 그리드 안 탭 정지점 한 개")
    c.expect(cells.evaluate_all("""els=>els.every(e=>e.tagName!=='BUTTON' &&
      (e.matches('[tabindex]') || e.querySelector('button')))"""),
             "E2 각 gridcell은 버튼이 아닌 포커스 셀 또는 버튼을 포함한 셀")
    _keyboard(c, '[data-tool="erase"]')
    _tab_into_grid(c)
    c.page.keyboard.press("Control+Home")
    c.page.keyboard.press("ArrowDown")
    for _ in range(4):
        c.page.keyboard.press("ArrowRight")
    c.eq(_active(c), "B5", "E2 Space를 보낼 설치 칸 B5 포커스")
    # 이동·포커스 스크롤이 끝난 뒤 측정한다. Space의 기본 스크롤은 keyup 뒤도 확인.
    c.page.wait_for_timeout(100)
    before = c.page.evaluate("window.scrollY")
    c.expect(c.page.evaluate("document.documentElement.scrollHeight > innerHeight"),
             "E2 페이지가 실제로 스크롤 가능한 조건")
    c.page.keyboard.press("Space")
    c.expect(_live_has(c, "B5", "지웠"), "E2 Space로 지우기 알림")
    c.eq(c.page.locator('#grid .cell[data-cell="B5"] .plant').count(), 0, "E2 Space 지우기 적용")
    c.eq(_saved(c).get("game", {}).get("q2"), [], "E2 Space 삭제 저장 후에도 스크롤 측정")
    c.eq(c.page.evaluate("window.scrollY"), before, "E2 Space 전후 window.scrollY 불변")
    c.eq(_active(c), "B5", "E2 Space 재그리기 뒤 포커스 유지")
    c.eq(grid.locator('[tabindex="0"]').count(), 1, "E2 Space 뒤 탭 정지점 한 개")
    c.check("E2 칸 구조·Space")


def t_E3_scene_uses_frozen_plant_table(c: Ctx):
    # u5:19: 장면에 생산·비용 사본을 두지 않고 깊게 동결한 model.data.PT 공개.
    c.goto("#y2022", wait="#grid .cell")
    source = c.page.evaluate("""async () => {const r=await fetch('ui/stage-2022.js');
      return {status:r.status,text:await r.text()}}""")
    c.eq(source["status"], 200, "E3 장면 소스 fetch 성공")
    code = re.sub(r"/\*.*?\*/|//[^\n]*", "", source["text"], flags=re.S)
    literals = re.findall(r'''(?:\b(?:out|cost)\b|["'](?:out|cost)["'])\s*:\s*\d+(?:\.\d+)?''', code)
    c.eq(literals, [], "E3 장면 소스에 out/cost 생산·비용 숫자 리터럴 사본 없음")
    table = c.page.evaluate("""() => {
      const pt=KCP.games['2022'].model?.data?.PT;
      const frozen=x=>!x || typeof x!=='object' ||
        (Object.isFrozen(x) && Object.values(x).every(frozen));
      return {exists:!!pt,deep:!!pt && frozen(pt),pt:pt || {}};
    }""")
    c.expect(table["exists"], "E3 model.data.PT 존재")
    c.expect(table["deep"], "E3 PT 표와 중첩 발전 설비 객체 동결")
    pt = table["pt"]
    c.eq(set(pt), {"fossil", "nuclear", "wind", "solar"}, "E3 PT 발전 설비 네 종류")
    for kind, output, cost in (("fossil", 60, 15), ("nuclear", 90, 15),
                               ("wind", None, 2), ("solar", None, 2)):
        entry = pt.get(kind, {})
        c.expect(bool(entry.get("n")), f"E3 {kind} 종류 이름 공개")
        c.eq(entry.get("cost"), cost, f"E3 {kind} 기당 비용")
        if output is None:
            c.expect(entry.get("out") is None, f"E3 {kind} 생산은 좌표별 자료에 따르며 고정값 없음")
        else:
            c.eq(entry.get("out"), output, f"E3 {kind} 생산량")


def t_E4_community_pick_result_save_export_and_removed_plant(c: Ctx):
    # u6:12~17: 자동 선택 없이 학생이 고른 한 기만 정지, 저장·복사·삭제 뒤 안내.
    game = _mixed_game()
    _seed(c, game, "reflect")
    _cards(c)
    community = c.page.locator('#tw22 [data-tw22="community"]').filter(
        has=c.page.locator("b").filter(has_text="협의"))
    c.eq(community.count(), 1, "E4 제목에 협의가 있는 community 카드")
    if not community.count():
        return
    community.click()
    controls = _pick_controls(c)
    c.expect(controls.count() > 0, "E4 #tw22-pick 또는 name=tw22-pick 선택 요소")
    if not controls.count():
        return
    c.eq(_picked(c), [], "E4 발전소 기본 선택 없음")
    c.eq(_saved(c).get("game", {}).get("twist", {}).get("pick"), "", "E4 미선택 pick 빈 문자열 저장")
    result = c.page.locator("#tw22-result")
    c.eq(result.get_attribute("role"), "status", "E4 선택 결과 role=status")
    text = result.inner_text()
    c.expect("고르면" in text, "E4 미선택 결과는 고르면 안내")
    c.expect(not re.search(r"\d|전체\s*생산량|총비용", text), "E4 미선택 결과에 계산 수치 없음")
    # q1 태양광 H7(15)과도 다르다. q2 I8(20)을 골라 205→185이어야 한다.
    pick, amount = "I8", 20
    produced = sum((60, 90, 20, 10, 5, 20))
    if controls.first.evaluate("e=>e.tagName==='SELECT'"):
        controls.first.select_option(pick)
    else:
        c.page.locator(f'#tw22 input[type="radio"][value="{pick}"]').check()
    c.eq(_picked(c), [pick], "E4 원자력이 아닌 I8 태양광 하나 선택")
    text = result.inner_text()
    c.expect("태양광" in text and pick in text, "E4 결과에 고른 발전소 종류·좌표")
    totals = re.search(r"전체\s*생산량\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:→|->)\s*(\d+(?:\.\d+)?)", text)
    c.expect(totals is not None, "E4 전체 생산량 전후 수치 존재")
    if totals:
        before, after = map(float, totals.groups())
        c.eq(before, produced, "E4 혼합 2번 계획 전체 생산량(1번 배치와 구분)")
        c.eq(after, produced - amount, "E4 선택한 태양광 생산만큼 감소")
        c.eq(before - after, amount, "E4 원자력 90 자동 정지가 아닌 I8 생산 20 감소")
    c.expect("왜" in text and "누구" in text and "협의" in text, "E4 선택 이유·협의 대상 메모 안내")
    saved = _saved(c).get("game", {})
    c.eq(saved.get("twist", {}).get("pick"), pick, "E4 state.game.twist.pick 좌표 저장")
    c.eq(saved.get("q2"), game["q2"], "E4 가정 적용이 실제 2번 발전소를 지우지 않음")
    c.eq(_wire_keys(saved.get("wires", [])), _wire_keys(game["wires"]), "E4 가정 적용 뒤 전선 보존")
    c.page.reload()
    c.page.wait_for_selector("#tw22-result")
    c.eq(_picked(c), [pick], "E4 새로고침 뒤 고른 발전소 복원")
    c.eq(_saved(c).get("game", {}).get("twist", {}).get("pick"), pick, "E4 새로고침 뒤 pick 저장 보존")
    c.eq(result.inner_text(), text, "E4 새로고침 뒤 같은 선택 결과 복원")
    # 메모를 입력하지 않아도 고른 발전소만으로 답안에 선택 한 줄을 내보내야 한다.
    c.page.evaluate("""() => {window.__g22clip=null;
      Object.defineProperty(navigator,'clipboard',{configurable:true,
        value:{writeText:text=>{window.__g22clip=text;return Promise.resolve()}}});} """)
    c.page.click("#copyAll")
    c.page.wait_for_function("window.__g22clip!==null || document.querySelector('#copyFallback-2022')", timeout=2000)
    copied = c.page.evaluate("window.__g22clip ?? document.querySelector('#copyFallback-2022')?.value ?? ''")
    # recap의 발전소 목록을 선택 한 줄로 오인하지 않고 조건 절에서 따로 찾는다.
    section = copied.partition("조건이 바뀐다면")[2]
    c.expect(any("고른 발전소" in line and "태양광" in line and pick in line
                 for line in section.splitlines()), "E4 답안 복사 조건 절에 고른 발전소 종류·좌표 한 줄")
    _phase(c, "prep")
    _keyboard(c, '[data-mode="q2"]')
    _keyboard(c, '[data-tool="erase"]')
    c.page.locator(f'#grid .cell[data-cell="{pick}"]').click()
    c.expect(_live_has(c, pick, "지웠"), "E4 계획에서 선택 발전소 삭제 알림")
    changed = _saved(c).get("game", {})
    c.expect(all(p["cell"] != pick for p in changed.get("q2", [])), "E4 선택 발전소가 실제 계획에서 삭제됨")
    c.eq(changed.get("twist", {}).get("pick"), pick, "E4 삭제 뒤 이전 pick을 지우지 않음")
    _phase(c, "reflect")
    stale = result.inner_text()
    c.expect("다시 고르세요" in stale, "E4 없어진 발전소는 다시 고르세요 안내")
    c.expect(not re.search(r"\d|전체\s*생산량|총비용", stale), "E4 없어진 선택에는 효과 미적용·수치 없음")
    c.eq(_saved(c).get("game", {}).get("twist", {}).get("pick"), pick, "E4 성찰 재진입 뒤에도 이전 pick 보존")
    c.check("E4 주민 협의 선택·복원·삭제")


def t_E4_community_pick_legacy_and_corrupt_saves(c: Ctx):
    # u6:15,18: 옛 pick 부재·숫자·범위 밖 문자열은 빈 문자열, 메모·계획 보존.
    for label, fields in (("옛 pick 없음", {}), ("숫자 pick", {"pick": 5}),
                           ("범위 밖 pick", {"pick": "Z9"})):
        game = _mixed_game()
        game["twist"] = {"k": "community", "line": "가상 협의 이유", "keep": "가상 유지 이유", **fields}
        _seed(c, game, "reflect")
        expected = {**game["twist"], "pick": ""}
        normalized = c.page.evaluate("raw => KCP.games['2022'].model.normalizeGame(raw)", game)
        c.eq(normalized.get("twist"), expected, f"E4 {label} normalizeGame 검증·메모 보존")
        saved = _saved(c).get("game", {})
        c.eq(saved.get("twist"), expected, f"E4 {label} 화면 저장도 빈 pick으로 정규화")
        c.expect(_pick_controls(c).count() > 0, f"E4 {label} 협의 선택 요소로 열림")
        c.eq(_picked(c), [], f"E4 {label} 자동 발전소 선택 없음")
        text = c.page.locator("#tw22-result").inner_text()
        c.expect("고르면" in text and not re.search(r"\d|전체\s*생산량|총비용", text),
                 f"E4 {label} 계산 대신 미선택 안내")
        for field in ("q1", "r1", "q2", "q2text", "wireVersion"):
            c.eq(saved.get(field), game[field], f"E4 {label} 기존 {field} 보존")
        c.eq(_wire_keys(saved.get("wires", [])), _wire_keys(game["wires"]), f"E4 {label} 전선 보존")
        c.check(f"E4 {label}")


if __name__ == "__main__":
    main(globals())
