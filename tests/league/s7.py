"""S7 명세 수용 검사 — 브라우저 실행은 샌드박스 밖 총괄 담당.

실행: tests/.venv/bin/python tests/league/s7.py http://127.0.0.1:9430/index.html
근거: _briefs/lanes/league/S7-fix3.md가 우선. 아래 I 번호는 유지된 기존
S7-impl.md 항목의 행 번호이며 '겹침=남는 값'·겹침 막대 명세는 폐기한다.
_briefs/design/s7/notes.md 19–25, LEAGUE-CANON.md 12·14행(목표 4·6).
I3/D-65 비전송, I12–19 분해·캐시, I20–25 고르기/공개, I26 이어붙이기,
I28 모바일, I37–40 2022 연결. 네 환경·진단·캡처는 검사 요청 8번.

S7 DOM은 전달받은 id/data 속성만 쓴다. 기존 흐름 조작은 league_flow,
econui, solo의 선택자를 재사용한다. 결과/약속/분해값을 주입하지 않는다.
계획은 공개 검사 API로 정상 연결 배치·태양광·빈 배치를 만든다. 복수 원인
사례는 시험 뒤 절전 정책을 선택하고, 재현 점검 사례는 같은 계획을 유지한다.
복제 상태로 예측을 고르며 실제 판은 UI로 진행한다.
"""

import json
import math
import re
import sys

from playwright.sync_api import sync_playwright
from league_flow import confirm_seat, select_mode, start_solo
from econui import (Checks, context_for, diagnostics, local_address, monitored_page,
                   open_panel, overflow, screenshot, shown)
from solo import click_next, close_drawer, read

VALUE = re.compile(r"([+−-]?\d[\d,]*(?:\.\d+)?)\s*%(?:p)?")
NAMES = {"choice": "내 선택", "weather": "날씨·운전 기간", "event": "사건",
         "trade": "이웃 거래"}
STATE = "() => { const l=KCP.league.state(); return l.S || l.snap; }"
SYNC = "([r,p]) => {const l=KCP.league.state(),s=l&&(l.S||l.snap); return s?.round===r&&s?.phase===p;}"

# CSS로만 가린 답도 textContent에 남는다. aria/title/data와 모든 자손을 읽는다.
# 단서의 MW/MWh/발전량 %/설비 개수는 정답 %p와 구별해야 한다(I20).
SURFACE = """root => {
  const nodes = [root], attrs = [], leaves = [];
  for (let i=0;i<nodes.length;i++) {
    const n=nodes[i]; nodes.push(...n.children);
    for (const a of n.attributes) if (/^(aria-|data-)|^title$/.test(a.name))
      attrs.push([a.name,a.value]);
    if (!n.children.length) leaves.push(n.textContent.trim());
  }
  return {text:root.textContent,attrs,leaves};
}"""
COUNT_SIM = """() => {
  if (window.__s7SimCalls !== undefined) return;
  window.__s7SimCalls=0;
  const original=KCP.buildGame.simulate;
  KCP.buildGame.simulate=function(...args) { window.__s7SimCalls++; return original.apply(this,args); };
}"""


def required(checks, condition, label):
    if not checks.ok(condition, label):
        raise AssertionError(label)


def capture(checks, page, label, stage):
    overflow(checks, page, f"{label} {stage}")
    screenshot(checks, page, f"s7-{label}-{stage}.png")


def plan_and_trial(page, empty=False, renewable=False, change_after=True):
    if shown(page, "#lg-guide-close"):
        page.locator("#lg-guide-close").click()
    close_drawer(page)
    assert page.evaluate("""([empty,renewable]) => KCP.league.plan(st => {
      const id=KCP.league.state().team;
      Object.assign(st, empty ? {builds:[],lines:[]} :
        structuredClone(KCP.ECON_DATA.normalStartPlans[id]), {policies:[]});
      if (renewable) {
        const B=KCP.buildGame, connected=new Set(st.lines.flatMap(l=>l.p));
        const tiles=B.TILES.filter(t=>!t.out && t.site<0 && !B.siteRule('solar',t) &&
          t.nb.some(i=>connected.has(i))).slice(0,10);
        if (tiles.length!==10) throw Error('태양광 시험 배치 부족');
        for (const t of tiles) {
          st.builds.push({t:'solar',i:t.i});
          st.lines.push({p:[t.nb.find(i=>connected.has(i)),t.i]});
        }
      }
    })""", [empty, renewable]), "계획 단계 배치 적용 실패"
    page.wait_for_timeout(500)
    page.locator('[data-run="7"]').click()
    page.wait_for_selector("#bd-skip")
    page.locator("#bd-skip").click()
    page.wait_for_selector("#bd-res-title")
    trial = page.evaluate("() => KCP.buildGame.lastTrial()")
    assert trial and trial["days"] == 7, "1주 시험 저장 없음"
    page.locator("#bd-drawer-x").click()
    if not empty and change_after:
        assert page.evaluate("() => KCP.league.plan(st => {st.policies=['save'];})")
    page.wait_for_timeout(500)
    return trial


def expected_operation(page, player, topic="uns"):
    """분해 함수와 독립: 실운영 엔진을 복제 상태에 실행. 실제 판은 불변."""
    return page.evaluate("""([id,topic]) => {
      const L=KCP.league.state(), C=KCP.leagueCore, B=KCP.buildGame;
      const before=JSON.stringify(L.S), S=structuredClone(L.S);
      try {
        if (L.role==='solo') {
          const save=JSON.parse(localStorage.getItem('kcp-league-solo-v1'));
          C.computerPlans(S,B,id,save.style || 'balanced',true);
        }
        const result=C.run(S,B,0);
        const actual=topic==='cash' ? S.econ.cities[id].cash-S.econ.before[id].cash : result.team[id].unsPct;
        if (JSON.stringify(L.S)!==before) throw Error('복제 운영이 원본을 변경함');
        return actual;
      } finally {B.selectPack(C.teamDef(C.regionOf('south'),id).pack,'league');}
    }""", [player, topic])


def promise(page, trial, actual, *, hit=False, topic="uns", baseline=None):
    # 2월부터 지난달과 비교한다. 실제 판정 함수 대신 명세의 정수 반올림 기준 사용.
    baseline = (0 if topic == "cash" else trial["unsPct"]) if baseline is None else baseline
    delta = actual - baseline
    direction = "same" if abs(delta) < .5 else "up" if delta > 0 else "down"
    prediction = direction if hit else ("down" if direction != "down" else "up")
    page.evaluate(COUNT_SIM)
    close_drawer(page)
    page.locator("#lg-ready").click()
    page.locator('[data-evidence="grid"]').click()
    page.locator(f'[data-pred="{topic}"]').select_option(prediction)
    page.locator('[data-confidence="fairly"]').click()
    page.locator("#lg-ready-confirm").click()
    return prediction


def current_note(page):
    return page.evaluate("""() => {
      const L=KCP.league.state(), V=L.snap || L.S;
      // 혼자 하기는 state()가 interview를 내보내지 않는다. 기기 저장본(kcp-league-solo-v1)에서 읽는다.
      const d=L.role==='solo' ? JSON.parse(localStorage.getItem('kcp-league-solo-v1') || '{}').interview :
        JSON.parse(localStorage.getItem(`kcp-league-data-v1:${L.room}:${L.team}`));
      return d?.interview?.months?.[V.round] || {};
    }""")


def current_attribution(page):
    return page.evaluate("""() => {
      const L=KCP.league.state(), V=L.snap || L.S;
      return KCP.league.uiMath.outageAttribution(V,V.results.at(-1),L.team);
    }""")


def frozen_after_retrial(checks, page, label):
    """실제 시험 UI로 저장 시험을 교체하고, 공개 당시 DOM·기기 기록을 비교한다."""
    def snapshot():
        return page.locator("#lg-missed").evaluate("""root => ({
          opened: root.dataset.opened,
          tags: [...root.querySelectorAll('[data-out-tag]')].map(n =>
            [n.closest('[data-missed]')?.dataset.missed, n.dataset.outTag, n.textContent]),
          bars: [...root.querySelectorAll('[data-out-step]')].map(n =>
            [n.dataset.outStep, n.dataset.outValue, n.textContent,
             n.querySelector('.lg-out-bar')?.getAttribute('style')]),
          summary: root.querySelector('#lg-outage-single')?.textContent,
          verdict: root.querySelector('#lg-outage-verdict')?.textContent,
          aria: root.querySelector('#lg-outage-waterfall')?.getAttribute('aria-label')
        })""")

    before = snapshot()
    note = current_note(page)
    required(checks, bool(note.get("missedCarry")) and
             bool(note.get("outageOpened") or note.get("outageSingleShown")),
             f"{label} 재시험 전에 공개·다음 달 기록 존재")
    trial = page.evaluate("() => KCP.buildGame.lastTrial()")
    required(checks, trial["days"] == 7, f"{label} 재시험 전 저장 시험 1주")
    state = read(page)["S"]
    close_drawer(page)
    page.locator('[data-run="30"]').click()
    page.wait_for_selector("#bd-skip")
    page.locator("#bd-skip").click()
    page.wait_for_selector("#bd-res-title")
    next_trial = page.evaluate("() => KCP.buildGame.lastTrial()")
    required(checks, next_trial["days"] == 30 and next_trial["month"] == trial["month"],
             f"{label} 결과 단계에서 같은 달 시험 1주 → 1달 실제 재실행")
    page.locator("#bd-drawer-x").click()
    open_panel(page, "result")
    checks.ok(page.evaluate(SYNC, [state["round"], "review"]), f"{label} 재시험 뒤 같은 달 결과 단계")
    for suffix in ("재시험", "재시험 후 새로고침"):
        if suffix.endswith("새로고침"):
            page.reload()
            page.wait_for_function(SYNC, arg=[state["round"], "review"])
            open_panel(page, "result")
        checks.ok(snapshot() == before, f"{label} {suffix}: 연 시점 꼬리표·막대·판정 유지")
        after = current_note(page)
        checks.ok(all(after.get(k) == note.get(k) for k in ("outageLargest", "missedCarry")),
                  f"{label} {suffix}: 연 시점 최대 몫·다음 달 기록 유지")


def copy_worksheet(page):
    page.evaluate("""() => {
      delete window.__s7Journal;
      Object.defineProperty(navigator,'clipboard',{configurable:true,
        value:{writeText:async text=>{window.__s7Journal=text;}}});
    }""")
    page.locator("#lg-jcopy").click()
    page.wait_for_function("() => typeof window.__s7Journal==='string'")
    return page.evaluate("window.__s7Journal")


def no_answer_records(checks, page, label):
    note = current_note(page)
    checks.ok(not any(note.get(k) for k in ("outageOpened", "outageSingleShown", "outageLargest")),
              f"{label} 열기/요약 표시 전 최대 몫 저장 없음")
    # 끝 단계까지 가지 않은 달에도 같은 공개 타임라인 렌더러 전체를 검사한다.
    # 기존 기록이나 결과·약속 값을 주입하지 않는다. 범례도 문구 금지의 예외가 아니다.
    html = page.evaluate("""() => {
      const L=KCP.league.state();
      return KCP.league.uiMath.trendHTML(L.snap || L.S,L.team,true);
    }""")
    checks.ok("가장 큰 몫" not in html and 'data-change="outage"' not in html,
              f"{label} 열기 전/적중 타임라인 전체에 최대 몫·원 표시 없음")
    open_panel(page, "journal")
    checks.ok("가장 큰 몫" not in page.locator("#lg-panel").text_content(),
              f"{label} 일지 DOM 최대 몫 없음")
    checks.ok("가장 큰 몫" not in copy_worksheet(page), f"{label} 활동지 최대 몫 없음")
    open_panel(page, "result")


def hidden_answer(checks, root, label, card=False):
    surface = root.evaluate(SURFACE)
    checks.ok(not re.search(r"\d\s*%p", surface["text"]), f"{label} 열기 전 DOM에 원인 %p 없음 [I20–21]")
    leaks = [(key, value) for key, value in surface["attrs"] if
             (key == "data-out-value" and value.strip()) or
             (key.startswith("data-") and re.search(r"\d", value)) or
             re.search(r"\d\s*%p", value) or
             (re.fullmatch(r"[+−-]?\d+(?:\.\d+)?", value.strip()))]
    checks.ok(not leaks, f"{label} aria/title/data 정답 유출 0: {leaks}")
    # 원인 크기 숫자를 단위와 다른 노드로 나누어 감춘 경우도 잡는다.
    checks.ok(not any(re.fullmatch(r"[+−-]?\d+\.\d+", s) for s in surface["leaves"]),
              f"{label} 숨은 소수 크기 텍스트 없음")
    if card:
        text = surface["text"].strip()
        key = root.get_attribute("data-missed")
        clue = text.replace(NAMES.get(key, ""), "").replace("?", "").strip()
        checks.ok("?" in text and len(clue) >= 8, f"{label} 크기 ? + 실제 단서 문구 [I20]")


def link(checks, page, selector, new_tab, label):
    a = page.locator(selector)
    required(checks, a.count() == 1 and a.is_visible(), f"{label} 연결 표시 [I38]")
    checks.ok(a.get_attribute("href") == "#y2022", f"{label} 충실판 주소 [I37]")
    checks.ok(a.inner_text() == "2022 기출로 연습하기", f"{label} 수정된 링크 문구")
    target = a.get_attribute("target")
    checks.ok(target == "_blank" if new_tab else target in (None, "", "_self"),
              f"{label} {'새' if new_tab else '같은'} 탭 [I40]")
    if new_tab:
        checks.ok("noopener" in (a.get_attribute("rel") or "").split(), f"{label} noopener [I40]")
    # 명세상 링크 옆의 한 줄도 허용한다. 시안처럼 링크 자체 글자만 강제하지 않는다.
    text = a.evaluate("el => el.parentElement.textContent")
    checks.ok(all(word in text for word in ("근거", "반문")) and
              any(word in text for word in ("설명", "말", "대응")), f"{label} 연습할 사고 습관 한 줄 [I39]")


def scene(checks, page, requests, label, width, trial, actual):
    open_panel(page, "result")
    required(checks, "다름" in page.locator('#lg-promise-result').inner_text(),
             f"{label} 반대 예측 → 다름 [요청1, 목표4]")
    root = page.locator("#lg-missed")
    required(checks, root.count() == 1 and root.get_attribute("data-single") == "false",
             f"{label} 두 원인이 있는 첫 달 카드 분기(생략으로 통과시키지 않음) [I24]")
    cards = page.locator("#lg-outage-cards [data-missed]")
    required(checks, 1 <= cards.count() <= 3, f"{label} 원인 카드 1~3장 [I20]")
    closed_card_keys = [c.get_attribute("data-missed") for c in cards.all()]
    checks.ok(closed_card_keys == [key for key in NAMES if key in closed_card_keys],
              f"{label} 열기 전 카드도 분해 순서의 부분열")
    checks.ok(cards.count() == 3, f"{label} 이 복수 원인 사례는 세 카드 [I22]")
    checks.ok(root.get_attribute("data-opened") == "false", f"{label} 고르기 전 닫힘")
    checks.ok(root.get_attribute("data-out-value") in (None, "") and
              all(n.get_attribute("data-out-value") == "" for n in root.locator('[data-out-value]').all()),
              f"{label} 닫힌 장면 전체 data-out-value 없음/빈 값 [요청2]")
    checks.ok(not shown(page, "#lg-outage-waterfall") and not shown(page, "#lg-outage-verdict"),
              f"{label} 고르기 전 폭포·판정 숨김 [I22]")
    for i in range(cards.count()):
        hidden_answer(checks, cards.nth(i), f"{label} 카드{i+1}", card=True)
    hidden_answer(checks, page.locator("#lg-outage-others"), label + " 나머지 후보")
    checks.ok(all(c.get_attribute("data-missed") in NAMES for c in cards.all()),
              f"{label} 카드 후보는 네 원인만(내 선택이 상위 3개 밖이면 허용)")
    no_answer_records(checks, page, label)
    checks.ok(page.locator("#lg-outage-open").is_disabled(), f"{label} 고르기 전에 열 수 없음 [I22]")
    if width == 390:
        boxes = [c.bounding_box() for c in cards.all()]
        checks.ok(all(b and b["height"] >= 44 for b in boxes), f"{label} 카드 버튼 ≥44px [I28]")
        checks.ok(all(boxes[i]["y"] >= boxes[i-1]["y"] + boxes[i-1]["height"] - 1
                      for i in range(1, len(boxes))), f"{label} 카드 세로 배치 [I28]")
        checks.ok(page.locator("#lg-outage-open").bounding_box()["height"] >= 44,
                  f"{label} 열기 버튼 ≥44px [I28]")
    cards.first.scroll_into_view_if_needed()
    capture(checks, page, label, "before")
    before_requests = len(requests)
    # 1280 밝음 혼자 하기는 최대가 아닌 유의미한 몫을 반드시 고른다.
    # 계산 API는 사례 선택에만 쓰고, 실제 판정은 열린 막대·꼬리표와 다시 비교한다.
    nonlargest = label == "1280x900-light-solo"
    picked = cards.first.get_attribute("data-missed")
    if nonlargest:
        parts = current_attribution(page)["parts"]
        maximum = max(abs(p["value"]) for p in parts)
        candidates = {c.get_attribute("data-missed") for c in cards.all()}
        choices = [p["key"] for p in parts if p["key"] in candidates and
                   .05 <= abs(p["value"]) < maximum]
        required(checks, bool(choices), f"{label} 최대가 아닌 유의미한 카드 존재")
        picked = choices[0]
    page.locator(f'#lg-outage-cards [data-missed="{picked}"]').click()
    for c in cards.all():
        hidden_answer(checks, c, label + " 고른 뒤 열기 전", card=True)
    page.locator("#lg-outage-open").click()
    checks.ok(page.locator("#lg-outage-verdict").get_attribute("tabindex") == "-1" and
              page.evaluate("document.activeElement?.id") == "lg-outage-verdict",
              f"{label} 열기 뒤 판정 머리로 초점 이동")
    required(checks, root.get_attribute("data-opened") == "true", f"{label} 열기 상태 보존 [I22]")
    for c in cards.all():
        match = re.search(r"([+−-]?\d[\d,]*(?:\.\d+)?)\s*%p", c.inner_text())
        raw = c.get_attribute("data-out-value")
        checks.ok(match is not None and raw not in (None, "") and
                  abs(float(match[1].replace("−", "-").replace(",", "")) - float(raw)) <= .0051,
                  f"{label} 열린 카드 %p와 속성 크기 일치 [I22]")
    checks.ok(page.locator('[data-out-tag="picked"]').inner_text() == "내가 고름" and
              page.locator(f'[data-missed="{picked}"] [data-out-tag="picked"]').count() == 1,
              f"{label} 고른 카드 꼬리표 [I22]")
    checks.ok(page.locator('[data-out-tag="largest"]').inner_text() == "가장 큼", f"{label} 최대 몫 꼬리표 [I22]")
    order = page.locator("#lg-outage-order").inner_text()
    checks.ok(all(s in order for s in ("순서", "내 선택", "날씨·운전 기간", "사건", "이웃 거래", "달라", "추정", "겹친 효과", "뒤 단계 몫")),
              f"{label} 순서 의존 안내 [I23]")
    rows = page.locator("#lg-outage-waterfall [data-out-step]")
    values, visible = {}, {}
    for row in rows.all():
        key = row.get_attribute("data-out-step")
        values[key] = float(row.get_attribute("data-out-value"))
        matches = VALUE.findall(row.inner_text())
        required(checks, len(matches) == 1, f"{label} {key} 화면 수치 한 개")
        visible[key] = float(matches[0].replace("−", "-").replace(",", ""))
        checks.ok(abs(visible[key] - values[key]) <= .0051, f"{label} {key} 표시 반올림")
        if values[key] < 0:
            checks.ok(row.locator('[data-negative="true"]').count() == 1, f"{label} {key} 감소 막대")
        track = row.locator('.lg-out-track').bounding_box()
        checks.ok(track is not None and track["width"] > 0, f"{label} {key} 실제 막대 칸 폭 > 0 ({width}px)")
    required(checks, set(values) - {"replay"} == {"trial", "actual", *NAMES} and
             rows.count() == (7 if "replay" in values else 6),
             f"{label} 시험 + (재현 차이) + 네 원인 + 실제")
    checks.ok(page.locator('[data-out-step="overlap"]').count() == 0, f"{label} 겹침 막대 0개")
    replay = page.evaluate("""() => {
      const L=KCP.league.state(), V=L.snap || L.S;
      return KCP.league.uiMath.outageAttribution(V,V.results.at(-1),L.team).replay;
    }""")
    checks.ok(("replay" in values) == (abs(replay) >= .01) and
              page.locator("#lg-outage-replay").count() == int(abs(replay) >= .01),
              f"{label} 재현 차이·설명은 절댓값 0.01%p 이상일 때만")
    checks.ok(all(n.get_attribute("data-out-other") in NAMES for n in page.locator('[data-out-other]').all()),
              f"{label} 나머지 후보도 네 원인만")
    waterfall = page.locator("#lg-outage-waterfall")
    aria = waterfall.get_attribute("aria-label") or ""
    aria_values = [float(v.replace("−", "-").replace(",", "")) for v in VALUE.findall(aria)]
    checks.ok(waterfall.get_attribute("role") == "img" and
              all(name in aria for name in ("시험", *NAMES.values(), "실제")) and
              aria_values == list(visible.values()), f"{label} 폭포 수치 요약 aria-label")
    checks.ok(abs(values["trial"] - trial["unsPct"]) <= 1e-9 and abs(values["actual"] - actual) <= 1e-9,
              f"{label} 폭포 출발·도착 = 실제 저장 시험·운영")
    checks.ok(abs(values["trial"] + replay + sum(values[k] for k in NAMES) - values["actual"]) <= 1e-9,
              f"{label} 재현 차이를 포함한 원시 합계 항등식")
    checks.ok(abs(sum(v for k, v in values.items() if k != "actual") - values["actual"]) <= .0200001,
              f"{label} 재현 생략을 고려한 폭포 합계 ±0.02%p")
    checks.ok(abs(sum(v for k, v in visible.items() if k != "actual") - visible["actual"]) <= .0200001,
              f"{label} 화면 합계 ±0.02%p [요청3]")
    largest = max(NAMES, key=lambda k: abs(values[k]))
    top = sorted(NAMES, key=lambda k: abs(values[k]), reverse=True)[:3]
    card_keys = [c.get_attribute("data-missed") for c in cards.all()]
    checks.ok(set(card_keys) == set(top) and len(card_keys) == len(set(card_keys)),
              f"{label} 카드는 네 원인 중 절댓값 상위 3개")
    checks.ok(card_keys == [key for key in NAMES if key in card_keys],
              f"{label} 카드 표시 순서는 분해 순서의 부분열(크기 순위와 무관)")
    checks.ok(card_keys == closed_card_keys, f"{label} 열기 전후 카드 순서 동일")
    checks.ok(page.locator('[data-missed="weather"] strong').count() == 0 or
              page.locator('[data-missed="weather"] strong').inner_text() == NAMES["weather"],
              f"{label} 날씨 표시 이름")
    checks.ok(page.locator(f'[data-missed="{largest}"] [data-out-tag="largest"]').count() == 1,
              f"{label} 가장 큼은 절댓값 최대 원인")
    checks.ok(page.locator("[data-out-grid]").count() == 1 and
              math.isfinite(float(page.locator("[data-out-grid]").get_attribute("data-out-grid"))) and
              "합계" in page.locator("#lg-outage-grid").inner_text() and
              "따로" in page.locator("#lg-outage-grid").inner_text(), f"{label} 접속 대기 별도 표시 [I15]")
    verdict = page.locator("#lg-outage-verdict").inner_text()
    if nonlargest:
        checks.ok(.05 <= abs(values[picked]) < abs(values[largest]) and picked != largest and
                  "몫은 있지만 가장 크지 않았어요" in verdict,
                  f"{label} 최대가 아닌 선택의 판정 분기")
    checks.ok(all(s in verdict for s in ("내가 고른 것", "가장 큰 것", "내 예측이 놓친 것")),
              f"{label} 판단 비교 세 줄 [I22]")
    simulations = int(root.get_attribute("data-simulations"))
    ms = float(root.get_attribute("data-ms"))
    checks.ok(0 < simulations <= 5, f"{label} 추가 시뮬레이션 ≤5 [I17]")
    checks.ok(math.isfinite(ms) and ms >= 0, f"{label} data-ms 읽기 [I18]")
    print(json.dumps({"S7_performance": label, "ms": ms, "simulations": simulations}, ensure_ascii=False), flush=True)
    calls = page.evaluate("window.__s7SimCalls")
    close_drawer(page)
    open_panel(page, "result")
    checks.ok(int(root.get_attribute("data-simulations")) == simulations and
              float(root.get_attribute("data-ms")) == ms and page.evaluate("window.__s7SimCalls") == calls,
              f"{label} 재열기 캐시: 실제 재시뮬레이션 0 [I17]")
    checks.ok(root.get_attribute("data-opened") == "true", f"{label} 재열기 공개 상태 유지")
    if width == 390:
        checks.ok(page.locator("#lg-outage-carry").bounding_box()["height"] >= 44,
                  f"{label} 붙이기 버튼 ≥44px [I28]")
    page.locator("#lg-outage-carry").click()
    checks.ok(page.locator("#lg-outage-carry").is_disabled(), f"{label} 다음 달에 붙이기 저장 [I26]")
    page.wait_for_timeout(500)
    checks.ok(len(requests) == before_requests, f"{label} 고르기·열기·붙이기 요청 증가 0 [I3/D-65]")
    link(checks, page, "#lg-y2022-result", True, label + " 결과")
    cards.first.scroll_into_view_if_needed()
    capture(checks, page, label, "opened")
    page.locator("#lg-outage-waterfall").scroll_into_view_if_needed()
    capture(checks, page, label, "waterfall")
    if nonlargest:
        frozen_after_retrial(checks, page, label)
    return {"picked": picked, "largest": largest, "largest_value": visible[largest],
            "nonlargest": nonlargest}


def carry(checks, page, expected, label):
    open_panel(page, "journal")
    c = page.locator("#lg-missed-carry")
    required(checks, c.count() == 1 and c.is_visible(), f"{label} 다음 달 지난달 놓친 것 표시 [I26]")
    text = c.inner_text()
    if expected["nonlargest"]:
        checks.ok(expected["picked"] != expected["largest"] and
                  f'지난달 놓친 것: {NAMES[expected["picked"]]}' in text and
                  f'가장 큰 몫 {NAMES[expected["largest"]]}' in text,
                  f"{label} 다음 달 줄에 고른 것 ≠ 가장 큰 것 표시")
    checks.ok(all(s in text for s in ("지난달 놓친 것", NAMES[expected["picked"]],
                                     "가장 큰 몫", NAMES[expected["largest"]])) and
              any(abs(float(v.replace("−", "-").replace(",", "")) - expected["largest_value"]) <= .0051
                  for v in VALUE.findall(text)), f"{label} 선택과 최대 몫·수치 유지")
    # 새 S7 선택자를 만들지 않고 기존 약속 흐름의 #lg-predict와 문서 순서를 비교.
    checks.ok(c.evaluate("el => !!(el.compareDocumentPosition(document.querySelector('#lg-predict')) & Node.DOCUMENT_POSITION_FOLLOWING)"),
              f"{label} 약속 카드 위에 표시 [I26]")
    capture(checks, page, label, "carry")
    return text


def end_record(checks, page, expected, label):
    open_panel(page, "result")
    # 기존 solo.py의 끝 화면 계약. S7 기록이 타임라인과 일지 양쪽에서 사라지면 실패.
    text = page.locator("#lg-timeline").text_content()
    checks.ok(all(s in text for s in ("놓친 것", NAMES[expected["picked"]], "가장 큰 몫",
                                     NAMES[expected["largest"]])), f"{label} 끝 타임라인 원인 기록 [I26]")
    link(checks, page, "#lg-y2022-end", False, label + " 끝")
    capture(checks, page, label, "end")
    journal = copy_worksheet(page)
    checks.ok(all(s in journal for s in ("놓친 것", NAMES[expected["picked"]], "가장 큰 몫",
                                        NAMES[expected["largest"]])), f"{label} 끝 활동지 일지 원인 기록 [I26]")
    checks.ok(page.locator("#lg-timeline svg").get_attribute("viewBox") == "0 0 380 346",
              f"{label} 타임라인 높이 346")
    for kind, y in (("outage", "310"), ("build", "325"), ("policy", "340")):
        marks = page.locator(f'#lg-timeline [data-change="{kind}"] > text')
        checks.ok(all(mark.get_attribute("y") == y for mark in marks.all()),
                  f"{label} {kind} 표시 y={y} (월 이름과 분리)")


def later_outage(checks, page, label):
    """2월 정전 오예측: 지난달 기준 안내와 무사건 후보도 검사한다."""
    state = read(page)["S"]
    player = read(page)["player"]
    trial = plan_and_trial(page, renewable=True)
    actual = expected_operation(page, player)
    baseline = state["results"][-1]["team"][player]["unsPct"]
    promise(page, trial, actual, baseline=baseline)
    page.wait_for_function(SYNC, arg=[state["round"], "review"])
    open_panel(page, "result")
    required(checks, "예상과 다름" in page.locator('[data-compare="uns"]').inner_text(),
             f"{label} 2월 이후 지난달 대비 오예측")
    note = page.locator("#lg-outage-baseline")
    required(checks, note.count() == 1 and note.is_visible(), f"{label} 지난달/시험 비교 기준 안내 표시")
    text = note.inner_text()
    checks.ok(all(word in text for word in ("약속", "지난달 대비", "나누기", "시험", "대비")),
              f"{label} 약속은 지난달 대비·나누기는 시험 대비")
    required(checks, page.locator("#lg-missed").get_attribute("data-single") in ("true", "false"),
             f"{label} 2월 유효한 분해(시험 없음 안내로 대체 불가)")
    if shown(page, "#lg-outage-open"):
        page.locator("#lg-outage-cards [data-missed]").first.click()
        page.locator("#lg-outage-open").click()
    keys = page.locator('#lg-missed [data-missed], #lg-missed [data-out-other]').evaluate_all(
        "nodes => nodes.map(n => n.dataset.missed || n.dataset.outOther)")
    checks.ok(bool(keys) and all(key in NAMES for key in keys), f"{label} 2월 후보 네 원인 안에서만")
    checks.ok(page.locator('[data-out-step="overlap"]').count() == 0, f"{label} 2월 겹침 막대 없음")
    event = page.locator('[data-out-step="event"]')
    if not read(page)["S"].get("events"):
        checks.ok(float(event.get_attribute("data-out-value")) == 0 and
                  "사건 없음" in page.locator("#lg-missed").text_content(), f"{label} 무사건 원인 몫 0·단서")
    capture(checks, page, label, "later-baseline")


def isolated_branch(checks, page, base, label, correct):
    """독립 판: 적중 달 유출 금지 / 빈 배치의 고르기 생략과 다음 달 연결."""
    page.goto(base + "#league")
    select_mode(page, "solo")
    page.locator('[data-select="lg-solo-city"][data-value="pyeongtaek"]').click()
    page.get_by_text("날씨·사건 · 연습 방식", exact=True).click()
    page.locator("#lg-solo-seed").select_option("fixed")
    start_solo(page, months=12)
    page.wait_for_function(SYNC, arg=[1, "plan"])
    trial = plan_and_trial(page, empty=not correct, change_after=False)
    player = read(page)["player"]
    actual = expected_operation(page, player)
    promise(page, trial, actual, hit=correct)
    page.wait_for_function(SYNC, arg=[1, "review"])
    open_panel(page, "result")
    attribution = current_attribution(page)
    required(checks, bool(attribution), f"{label} 같은 계획의 실제 시험 경로 분해 가능")
    checks.ok(math.isfinite(attribution["replay"]) and abs(attribution["replay"]) < .01,
              f"{label} 시험 뒤 계획 불변: 실제 UI 시험과 재현 차이 < 0.01%p")
    if correct:
        checks.ok("예상과 같음" in page.locator('[data-compare="uns"]').inner_text(), f"{label} 정전 예측 적중")
        checks.ok(page.locator("#lg-outage-cards, #lg-outage-single, #lg-outage-waterfall").count() == 0,
                  f"{label} 적중 달 원인 카드·요약 없음")
        no_answer_records(checks, page, label)
        for _ in range(25):
            state = read(page)["S"]
            if state["phase"] == "end":
                break
            click_next(page, state)
        page.wait_for_function(SYNC, arg=[12, "end"])
        open_panel(page, "result")
        checks.ok("가장 큰 몫" not in page.locator("#lg-timeline").text_content() and
                  page.locator('#lg-timeline [data-change="outage"]').count() == 0,
                  f"{label} 적중·건너뛴 달만 있는 끝 타임라인 유출 없음")
        checks.ok("가장 큰 몫" not in copy_worksheet(page), f"{label} 끝 활동지 유출 없음")
        capture(checks, page, label, "correct-end")
        return
    required(checks, "예상과 다름" in page.locator('[data-compare="uns"]').inner_text() and
             page.locator("#lg-missed").get_attribute("data-single") == "true" and
             shown(page, "#lg-outage-single"), f"{label} 빈 배치 오예측의 한 줄 요약 실제 표시")
    checks.ok(page.locator('#lg-outage-cards [data-missed], #lg-outage-open').count() == 0,
              f"{label} 요약 달 카드 고르기 생략")
    note = current_note(page)
    no_cause = all(abs(p["value"]) < .05 for p in attribution["parts"])
    checks.ok(note.get("outageSingleShown") is True and not note.get("outageOpened") and
              (not note.get("outageLargest") if no_cause else
               note.get("outageLargest", {}).get("key") in NAMES),
              f"{label} 표시 뒤 요약 기록·0.05%p 미만이면 최대 몫 저장 없음")
    if no_cause:
        text = page.locator("#lg-missed").inner_text()
        checks.ok("뚜렷한 원인 없음" in text and "가장 큰 것:" not in text and
                  "가장 큰 몫" not in text and page.locator('[data-out-tag="largest"]').count() == 0,
                  f"{label} 모든 몫 < 0.05%p: 최대 몫 표시 없음")
    page.locator("#lg-outage-carry").click()
    carry_choice = current_note(page).get("missedCarry", {}).get("missed")
    checks.ok(carry_choice in (("뚜렷한 원인 없음", "고르기 생략") if no_cause else ("고르기 생략",)),
              f"{label} 요약 달 다음 달 기록을 학생의 선택으로 꾸미지 않음")
    if no_cause:
        checks.ok(not current_note(page).get("missedCarry", {}).get("largest"),
                  f"{label} 뚜렷한 원인 없는 달은 다음 달 최대 몫 저장 없음")
        html = page.evaluate("""() => {
          const L=KCP.league.state(); return KCP.league.uiMath.trendHTML(L.snap || L.S,L.team,true);
        }""")
        checks.ok("뚜렷한 원인 없음" in html and "가장 큰 몫" not in html,
                  f"{label} 타임라인: 뚜렷한 원인 없음")
        open_panel(page, "journal")
        worksheet = copy_worksheet(page)
        checks.ok("뚜렷한 원인 없음" in worksheet and "가장 큰 몫" not in worksheet,
                  f"{label} 일지: 뚜렷한 원인 없음")
        open_panel(page, "result")
    if label == "1280x900-light-solo-single":
        frozen_after_retrial(checks, page, label)
    click_next(page, read(page)["S"])
    page.wait_for_function(SYNC, arg=[2, "plan"])
    for suffix in ("", "-reload"):
        if suffix:
            page.reload()
            page.wait_for_function(SYNC, arg=[2, "plan"])
        open_panel(page, "journal")
        checks.ok(("뚜렷한 원인 없음" if no_cause else "지난달 놓친 것: 고르기 생략") in
                  page.locator("#lg-missed-carry").inner_text(),
                  f"{label}{suffix} 다음 달 학생이 고른 것처럼 표시하지 않음")
        if no_cause:
            text = page.locator("#lg-missed-carry").inner_text()
            checks.ok("뚜렷한 원인 없음" in text and "가장 큰 몫" not in text,
                      f"{label}{suffix} 다음 달 줄: 뚜렷한 원인 없음")
        capture(checks, page, label + suffix, "single-carry")


def solo(checks, page, requests, base, label, width):
    page.goto(base + "#league")
    select_mode(page, "solo")
    page.locator('[data-select="lg-solo-city"][data-value="pyeongtaek"]').click()
    page.get_by_text("날씨·사건 · 연습 방식", exact=True).click()
    page.locator("#lg-solo-seed").select_option("fixed")
    start_solo(page, months=12)
    required(checks, page.evaluate(SYNC, [1, "plan"]), f"{label} 혼자 하기 1월 계획")
    # 1월에 접속 신청한 태양광이 2월에 연결돼 무사건 날씨 몫도 생긴다.
    trial = plan_and_trial(page, renewable=True)
    player = read(page)["player"]
    expected = expected_operation(page, player)
    promise(page, trial, expected)
    page.wait_for_function(SYNC, arg=[1, "review"])
    actual = read(page)["S"]["results"][-1]["team"][player]["unsPct"]
    checks.ok(actual == expected, f"{label} 복제 운영 방향과 실제 운영 일치")
    picked = scene(checks, page, requests, label, width, trial, actual)
    # 실제 새 탭 이동도 확인하고 원래 판의 달·단계를 보존한다(I40).
    popup_events = {"error": [], "warning": [], "pageerror": []}

    def watch_popup(tab):
        tab.on("console", lambda m: popup_events[m.type].append(m.text)
               if m.type in ("error", "warning") else None)
        tab.on("pageerror", lambda error: popup_events["pageerror"].append(str(error)))

    page.context.once("page", watch_popup)
    with page.expect_popup() as popup:
        page.locator("#lg-y2022-result").click()
    popup.value.wait_for_url("**#y2022")
    checks.ok(popup.value.evaluate("window.opener === null"), f"{label} 새 탭 opener 없음")
    diagnostics(checks, popup_events, label + " 2022 새 탭")
    popup.value.close()
    checks.ok(page.evaluate(SYNC, [1, "review"]), f"{label} 2022 새 탭 뒤 진행 보존")
    observation = click_next(page, read(page)["S"])
    required(checks, observation["S"]["round"] == 2 and observation["S"]["phase"] == "plan", f"{label} 2월 계획")
    before = carry(checks, page, picked, label)
    page.reload()
    page.wait_for_function(SYNC, arg=[2, "plan"])
    checks.ok(carry(checks, page, picked, label + "-reload") == before,
              f"{label} 새로고침 뒤 기기 저장 유지 [I26]")
    if read(page)["S"]["econ"]["cities"][player]["cash"] >= 0:
        later_outage(checks, page, label)
    else:
        print(f"미실행: {label} 2월은 자동 현금 주제 — Node 2월 안내 검사로 별도 확인", flush=True)
    cash_checked = False
    for _ in range(25):
        state = read(page)["S"]
        if state["phase"] == "end":
            break
        # 현재 UI에는 주제 선택기가 없다. 실제 운영으로 음수 현금이 된 달에
        # 자동 현금 주제의 반대 예측을 고른다. 상태·현금·주제는 주입하지 않는다.
        if state["phase"] == "plan" and state["round"] < 12 and not cash_checked and state["econ"]["cities"][player]["cash"] < 0:
            trial = plan_and_trial(page)
            delta = expected_operation(page, player, "cash")
            promise(page, trial, delta, topic="cash")
            page.wait_for_function(SYNC, arg=[state["round"], "review"])
            open_panel(page, "result")
            checks.ok("예상과 다름" in page.locator('[data-compare="cash"]').inner_text(),
                      f"{label} 현금 주제 오예측 실제 진행")
            checks.ok(page.locator('#lg-outage-cards, #lg-outage-single, #lg-outage-waterfall, #lg-missed.lg-outage').count() == 0,
                      f"{label} 현금 오예측에 정전 원인 카드 없음")
            note = current_note(page)
            checks.ok(not any(note.get(k) for k in ("outageLargest", "outageOpened", "outageSingleShown")),
                      f"{label} 현금 달 최대 몫 저장 없음")
            capture(checks, page, label, "cash-miss")
            cash_checked = True
            continue
        click_next(page, state)
    if not cash_checked:
        print(f"미실행: {label} 음수 현금 달이 없어 현금 주제 UI 분기 미검증", flush=True)
    state = read(page)["S"]
    required(checks, state["phase"] == "end" and state["round"] == 12 and len(state["results"]) == 12,
             f"{label} 12달 실제 운영 완주")
    end_record(checks, page, picked, label)
    page.reload()
    page.wait_for_function(SYNC, arg=[12, "end"])
    end_record(checks, page, picked, label + "-reload")


def public_state(page):
    return page.evaluate("""() => {
      const L=KCP.league.state();
      const V=structuredClone(L.snap || KCP.leagueCore.publicView(L.S,0));
      delete V.now; return V;
    }""")


def private_fields(value):
    if isinstance(value, dict):
        return [k for k in value if re.search(r"missed|outageOpened|outageSingleShown|outageLargest|outageFrozen|outageNoCause|outCache", k, re.I)] + [
            k for v in value.values() for k in private_fields(v)]
    if isinstance(value, list):
        return [k for v in value for k in private_fields(v)]
    return []


def multiplayer(checks, context, base, label, width, pages, requests):
    host, he = monitored_page(context)
    pages.append((host, he, "host"))
    host.goto(base + "#league")
    select_mode(host, "host")
    host.locator('[data-preset="3"]').click()
    host.locator('[data-turns="12"]').click()
    host.locator("#lg-host-seed").select_option("fixed")
    host.locator("#lg-host").click()
    host.wait_for_selector("#lg-roomcode")
    room = host.locator("#lg-roomcode").inner_text()
    team, te = monitored_page(context)
    pages.append((team, te, "team"))
    team.goto(base + "#league")
    select_mode(team, "join")
    team.locator("#lg-code").fill(room)
    team.locator("#lg-join").click()
    confirm_seat(team, "pyeongtaek")
    host.locator("#lg-next").click()
    team.wait_for_function(SYNC, arg=[1, "plan"])
    trial = plan_and_trial(team)
    # 진행자가 실제로 받은 계획을 기다려 복제 운영의 입력을 확정한다.
    host.wait_for_function("() => KCP.league.state().S.teams.pyeongtaek.plan.policies.includes('save')")
    actual = expected_operation(host, "pyeongtaek")
    promise(team, trial, actual)
    host.wait_for_function("() => KCP.league.state().S.teams.pyeongtaek.ready")
    host.locator("#lg-next").click()
    team.wait_for_function(SYNC, arg=[1, "review"])
    host.wait_for_function(SYNC, arg=[1, "review"])
    actual = team.evaluate(STATE)["results"][-1]["team"]["pyeongtaek"]["unsPct"]
    # 정기 공개 갱신 한 주기(4초)도 지나서 읽는다. now만 제외, 새 필드는 모두 비교.
    before_h, before_t = public_state(host), public_state(team)
    before_dom = json.dumps(host.locator("body").evaluate(SURFACE), ensure_ascii=False)
    chosen = scene(checks, team, requests, label + "-team", width, trial, actual)
    team.wait_for_timeout(4500)
    after_h, after_t = public_state(host), public_state(team)
    checks.ok(before_h == after_h and before_t == after_t,
              f"{label} 고르기·붙이기 뒤 진행자/팀 공개 스냅숏 불변 [I3/D-65]")
    checks.ok(not private_fields(after_h) and not private_fields(after_t), f"{label} 공개 상태에 사적 원인 필드 0")
    checks.ok(host.evaluate("location.hash") == "#league/host", f"{label} 진행자 경로 확인")
    surface = host.locator("body").evaluate(SURFACE)
    serialized = json.dumps(surface, ensure_ascii=False)
    checks.ok(not any(s in serialized for s in ("내가 고름", "지난달 놓친 것", "missedCarry", "data-missed")),
              f"{label} 진행자 DOM·aria·data에 고른 원인 없음 [I3/D-65]")
    checks.ok(serialized.count(NAMES[chosen["picked"]]) <= before_dom.count(NAMES[chosen["picked"]]),
              f"{label} 진행자 DOM에 고른 범주 문구도 새로 나타나지 않음")
    capture(checks, host, label + "-host", "private")
    # 진행자 버튼으로 마지막 달까지 운영. 팀 끝 연결도 확인한다.
    for _ in range(25):
        state = host.evaluate(STATE)
        if state["phase"] == "end":
            break
        host.locator("#lg-next").click()
        host.wait_for_function("([r,p]) => {const s=KCP.league.state().S;return s.round!==r||s.phase!==p;}",
                               arg=[state["round"], state["phase"]])
    host.wait_for_function(SYNC, arg=[12, "end"])
    team.wait_for_function(SYNC, arg=[12, "end"])
    link(checks, host, "#lg-y2022-host", False, label + " 진행자 끝")
    capture(checks, host, label + "-host", "end")
    end_record(checks, team, chosen, label + "-team")


def main():
    checks = Checks()
    try:
        base = local_address(sys.argv)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for width, height in ((1280, 900), (390, 844)):
                for scheme in ("light", "dark"):
                    label = f"{width}x{height}-{scheme}"
                    for mode in ("solo", "multi", "solo-correct", "solo-single"):
                        context, external = context_for(browser, base, width, height, scheme)
                        requests, pages = [], []
                        context.on("request", lambda request, sink=requests: sink.append(request.url))
                        try:
                            if mode.startswith("solo"):
                                page, events = monitored_page(context)
                                pages.append((page, events, "solo"))
                                if mode == "solo":
                                    solo(checks, page, requests, base, label + "-solo", width)
                                else:
                                    isolated_branch(checks, page, base, label + "-" + mode,
                                                    correct=mode == "solo-correct")
                            else:
                                multiplayer(checks, context, base, label, width, pages, requests)
                        except Exception as exc:
                            checks.ok(False, f"{label} {mode} {type(exc).__name__}: {str(exc).splitlines()[0][:250]}")
                            for page, _, role in pages:
                                screenshot(checks, page, f"s7-{label}-{role}-failure.png")
                        finally:
                            for page, events, role in pages:
                                diagnostics(checks, events, f"{label} {role}")
                            checks.ok(not external, f"{label} {mode} 외부 연결 시도 0: {external}")
                            context.close()
            browser.close()
    except Exception as exc:
        checks.ok(False, f"검사 실행 예외 {type(exc).__name__}: {str(exc).splitlines()[0][:250]}")
    return checks.finish()


if __name__ == "__main__":
    sys.exit(main())
