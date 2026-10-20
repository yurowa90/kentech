"""품질8 W4: 자연 발생 사건의 예보·확정 카드와 지도 분위기 수용 검사.

실행(총괄 Claude의 샌드박스 밖 로컬 환경):
  tests/.venv/bin/python tests/league/fx_event.py http://127.0.0.1:9430/index.html
서버는 tests/srv.py를 쓴다. 작성 세션에서는 py_compile만 실행한다.

1280×900/390×844 밝음 × 일반/reduce의 빈 컨텍스트에서 화면 단추로
최대 12달 진행한다. 사건/씨앗/계획/저장소를 주입하거나 fx API를 직접
호출하지 않는다. 사건을 못 만나면 SKIP이며 Checks의 통과 수에 넣지 않는다.
분위기 표는 w4-event-cards.md 3절의 독립 기대값이다. 여러 사건은 자료
순서의 첫 유효 분위기를 비교한다. 자연 발생하지 않은 id는 별도 SKIP한다.
명세 1절은 새로고침·재마운트를 포함해 같은 방·달의 재표시를 금지한다.
첫 해당 사건에서 Esc→서랍 왕복→새로고침을 확인하고 결과로 이어 간다.
DOM 관찰자는 앱 상태를 바꾸지 않고 첫 등장/180ms 뒤의 사각형·면을
기록한다. reduce는 두 시각 모두 움직임이 없고 처음부터 확정 면만 보여야
한다. 위치 변화는 배치 기준 요소의 크기 변화가 없을 때만 실패로 센다.
일반 동작의 겹침은 등장 애니메이션 후, reduce는 최초 표본에서도 검사한다.
캡처는 econui 형식(tests/results/fx-event-*.png), 마지막 줄은 checks N fail M.
"""

import re
import sys

from playwright.sync_api import sync_playwright

from econui import (BOOT_JS, WAIT, Checks, context_for, diagnostics,
                    local_address, monitored_page, overflow, screenshot)
from league_flow import pass_issue_check, start_solo, wait_unfolded
from solo import CHANGED_JS, PROGRESS_OR_PREDICT_JS, close_drawer


# w4-event-cards.md 3절. 구현의 EVENT_MOOD를 읽어 기대값으로 쓰지 않는다.
EVENT_MOOD = {
    'heatwave_peak': 'heat',
    'evening_peak_tropical_night': 'heat',
    'coldwave_heating': 'cold',
    'heavy_snow_solar': 'snow',
    'typhoon_coast': 'storm',
    'monsoon_cloud': 'cloud',
    'spring_dust_haze': 'haze',
    'finedust_coal_cap': 'haze',
}

DOM_JS = r"""(() => {
  const visible = el => {
    if (!el || !el.getClientRects().length) return false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n.hidden || s.display === 'none' || s.visibility === 'hidden' ||
          s.visibility === 'collapse' || Number(s.opacity) === 0) return false;
      if (n.tagName === 'DETAILS' && !n.open && !n.querySelector('summary')?.contains(el))
        return false;
    }
    return true;
  };
  const rect = el => {
    const r = el.getBoundingClientRect();
    return {x:r.x, y:r.y, width:r.width, height:r.height};
  };
  const overlap = (a, b) => Math.min(a.x+a.width, b.x+b.width) > Math.max(a.x,b.x) &&
    Math.min(a.y+a.height,b.y+b.height) > Math.max(a.y,b.y);
  const layout = () => [...document.querySelectorAll(
    // fx-turn place()가 피하는 요소 전부(#bd-hud·#bd-mapbar·#lg-map-result·.lg-map-guidance·#lg-plan-issues 포함).
    // 이 요소가 늦게 나타나 카드가 다시 놓이는 것은 배치 변화이지 움직임이 아니다(명세 W4 '움직임 줄이기').
    '.lg-bar, #lg-panel, #bd-dock, #bd-root, #bd-drawer, .bd-layers, #bd-hud, #bd-mapbar, ' +
    '#lg-map-result, .lg-map-guidance, #lg-plan-issues, #bd-subtools, [data-issue], #lg-issue-check, #lg-coach')].map(el => {
      // 크기뿐 아니라 위쪽 위치(y)도 본다: #lg-map-result처럼 크기는 그대로인데 위치가 늦게 자리 잡는 요소가 있다.
      const {y, width, height} = rect(el);
      return {key:el.id || el.getAttribute('data-issue') || '.' + el.classList[0],
        y: Math.round(y * 8) / 8, width, height};
    });
  const cards = () => [...document.querySelectorAll('.fx-turn-cards article')].map(el => {
    const box = rect(el), back = el.querySelector('.fx-turn-back');
    const front = el.querySelector('.fx-turn-front');
    const face = back || el.querySelector('.fx-turn-face') || el;
    const blockers = [...document.querySelectorAll(
      '.lg-bar, #lg-panel, #bd-dock, [data-issue], #lg-issue-check, #lg-coach')]
      .filter(visible);
    return {title:face.querySelector('h3')?.textContent.trim(),
      tag:face.querySelector('.fx-turn-tag')?.textContent.trim(),
      body:face.querySelector('p')?.textContent.trim(),
      big:face.querySelector('.fx-turn-big')?.textContent.trim() || '',
      active:el.getAttribute('data-active'),
      visibility:getComputedStyle(el).visibility,
      layerOver:el.closest('.fx-turn-layer')?.getAttribute('data-over') ?? null,
      frontTitle:el.querySelector('.fx-turn-front h3')?.textContent.trim() || null,
      hasBack:!!back,
      frontVisible:visible(front),
      frontHidden:!!front && (front.hidden || getComputedStyle(front).display === 'none'),
      backFinal:!!back && !back.hidden && getComputedStyle(back).display !== 'none' &&
        getComputedStyle(back).transform === 'none',
      backVisible:visible(back), visible:visible(el), box,
      opacity:Number(getComputedStyle(el).opacity),
      transform:getComputedStyle(el).transform,
      animation:getComputedStyle(el).animationName,
      transition:getComputedStyle(el).transitionDuration,
      inside:box.x >= 0 && box.y >= 0 && box.x+box.width <= innerWidth &&
        box.y+box.height <= innerHeight && box.width > 0 && box.height > 0,
      overlaps:blockers.filter(b => overlap(box,rect(b)))
        .map(b => b.id || b.getAttribute('data-issue') || b.className),
      blockers:blockers.map(b => b.id || b.getAttribute('data-issue') || b.className)};
  });
  return {visible, cards, layout};
})()"""

OBSERVE_JS = r"""() => {
  const L = window.KCP?.league?.state?.(), S = L?.S || L?.snap;
  if (!S) return null;
  const C = KCP.leagueCore, R = C.regionOf(S.region), result = S.results?.at(-1);
  const events = (S.events || []).filter(ev => ev.round === S.round).map(ev => {
    const E = C.eventDef(R, ev.id);
    return {id:ev.id, name:E?.name || null, mine:!!E && C.hits(R,E,L.team)};
  });
  return {round:S.round, phase:S.phase, count:S.results?.length || 0,
    room:S.room, team:L.team, months:C.roundsOf(S).length, events,
    resultRound:result?.round, resultEvents:result?.events || [],
    fx:KCP.fxTurn?.state?.() || null,
    setMapMood:typeof KCP.buildGame?.setMapMood === 'function',
    cards:(""" + DOM_JS + r""").cards()};
}"""

# 첫 등장 시각은 Python의 locator 대기/스크린샷보다 먼저 수집한다.
# 한 카드 묶음당 한 번만 기록하며 localStorage/앱의 상태/함수는 수정하지 않는다.
PROBE_JS = r"""(() => {
  const seen = new WeakSet();
  window.__fxEventProbe = [];
  const scan = () => {
    for (const deck of document.querySelectorAll('.fx-turn-cards')) {
      if (seen.has(deck)) continue;
      seen.add(deck);
      const L=window.KCP?.league?.state?.(), S=L?.S || L?.snap;
      const dom=(""" + DOM_JS + r""");
      const sample=() => ({at:performance.now(), cards:dom.cards(), layout:dom.layout()});
      const record={round:S?.round, phase:S?.phase,
        forecast:KCP.fxTurn?.state?.().forecastOpen, first:sample(), later:null,
        layoutChanges:[]};
      window.__fxEventProbe.push(record);
      let previous=record.first.layout;
      const trackLayout = current => {
        if (JSON.stringify(previous) !== JSON.stringify(current))
          record.layoutChanges.push({at:performance.now(), before:previous, after:current});
        previous=current;
      };
      const frame = () => {
        if (record.later || !deck.isConnected) return;
        trackLayout(dom.layout()); requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      setTimeout(() => {
        if (!deck.isConnected) return;
        record.later=sample(); trackLayout(record.later.layout);
      },180);
    }
  };
  new MutationObserver(scan).observe(document,{childList:true,subtree:true});
})();"""


def observe(page):
    return page.evaluate(OBSERVE_JS)


def wait_state(page, round_number, phases):
    return page.wait_for_function("""([round, phases]) => {
      const s=(""" + OBSERVE_JS + """)();
      return s?.round === round && phases.includes(s.phase) ? s : false;
    }""", arg=[round_number, phases], timeout=WAIT, polling='raf').json_value()


def click_progress(page, before):
    """fx_replay.py와 같은 준비→문제 확인→약속→결과의 화면 조작."""
    close_drawer(page)
    previous = [before['round'], before['phase'], before['count']]
    candidates = [page.locator('#lg-ready'), page.locator('#lg-next'),
                  page.get_by_role('button', name=re.compile(
                      r'^(?:준비(?: 완료)?|다음 (?:달|턴|라운드)(?:.*)?|'
                      r'최종 (?:결과|순위)(?:.*)?|리그 끝|끝내기|운영(?:.*)?)$'))]
    for buttons in candidates:
        for i in range(buttons.count()):
            button = buttons.nth(i)
            if not button.is_visible() or not button.is_enabled():
                continue
            ready = button.get_attribute('id') == 'lg-ready'
            button.click()
            if ready:
                pass_issue_check(page)
            if ready and before['phase'] == 'plan':
                page.wait_for_function("""args => {
                  const confirm=document.querySelector('#lg-ready-confirm');
                  return (""" + PROGRESS_OR_PREDICT_JS + """)(args) ||
                    !!confirm?.getClientRects().length;
                }""", arg=previous)
                if not page.evaluate(CHANGED_JS, previous):
                    skip = page.locator('#lg-predict-skip')
                    if skip.count() and skip.is_visible() and skip.is_enabled():
                        skip.click()
                    else:
                        page.locator('[data-evidence="evening"]').click()
                        page.locator('[data-pred]').select_option('down')
                        page.locator('[data-confidence="fairly"]').click()
                        page.locator('#lg-ready-confirm').click()
                return wait_state(page, before['round'], ['review', 'end'])
            page.wait_for_function(CHANGED_JS, arg=previous)
            return observe(page)
    raise AssertionError(f"{before['round']}월 {before['phase']}: 진행 단추 없음")


def mood(checks, state, label, seen):
    ids = [ev['id'] for ev in state['events'] if ev['mine']]
    selected = next((key for key in ids if key in EVENT_MOOD), None)
    expected = EVENT_MOOD.get(selected)
    if selected:
        seen.add(selected)
    checks.ok(state['fx'] is not None and 'mood' in state['fx'] and
              state['fx']['mood'] == expected,
              f"{label} 내 도시 사건 {ids} → mood {expected!r} "
              f"(실제 {(state['fx'] or {}).get('mood')!r})")


def card_details(cards):
    # 브리프 3항: 실패한 바로 그 표본을 남긴다(이후 DOM을 다시 읽지 않는다).
    return [{key: c[key] for key in
             ('title', 'active', 'visibility', 'visible', 'box', 'layerOver')}
            for c in cards]


def geometry(checks, page, label, mobile, cards=None):
    cards = observe(page)['cards'] if cards is None else cards
    visible = [c for c in cards if c['visible']]
    details = card_details(cards)
    checks.ok(bool(visible), f'{label} 실제 보이는 카드 존재: {details}')
    checks.ok(bool(visible) and all(c['inside'] for c in visible),
              f'{label} 카드가 뷰포트 안의 양수 크기: {details}')
    # 이 브리프 1항의 좁은 화면 대체 배치: data-over=true일 때만 열린
    # #lg-panel 위에 뜰 수 있다. 막대·도구·문제 칩·코치는 계속 금지한다.
    collisions = []
    for c in visible:
        blocked = [key for key in c['overlaps']
                   if not (key == 'lg-panel' and c['layerOver'] == 'true')]
        if blocked:
            collisions.append((c['title'], blocked))
    checks.ok(bool(visible) and not collisions,
              f'{label} 막대·열린 서랍(data-over=true 제외)·도구·문제·코치 '
              f'겹침 0: {collisions}; 카드 {details}')
    if mobile:
        checks.ok(len(visible) == 1, f'{label} 390px 카드 한 장씩: {details}')
    overflow(checks, page, label)


def reduced_entry(checks, page, round_number, forecast, label, mobile, forecast_names):
    record = page.wait_for_function("""([round, forecast]) => {
      const r=window.__fxEventProbe.find(r => r.round===round && r.forecast===forecast);
      return r?.later ? r : false;
    }""", arg=[round_number, forecast], timeout=2000).json_value()
    first, later = record['first']['cards'], record['later']['cards']
    first_visible = [(i, c) for i, c in enumerate(first) if c['visible']]
    details = f'최초 {card_details(first)}; 180ms {card_details(later)}'
    # W4 소유와 금지/2절: reduce의 금지는 움직임이다. 막대 줄바꿈 등으로
    # 배치 기준 크기가 바뀐 재배치는 애니메이션으로 세지 않는다. 오차 허용은
    # 추가하지 않고 두 표본과 그 사이 프레임의 실제 크기 변화를 근거로 남긴다.
    moving = [(when, i, {key: c[key] for key in
                        ('transform', 'opacity', 'animation', 'transition')})
              for when, cards in (('최초', first), ('180ms', later))
              for i, c in enumerate(cards)
              if not (c['transform'] == 'none' and c['opacity'] == 1 and
                      all(v.strip() == 'none' for v in c['animation'].split(',')) and
                      all(v.strip() == '0s' for v in c['transition'].split(',')))]
    checks.ok(bool(first_visible) and not moving,
              f'{label} 두 시각 모두 transform none·opacity 1·animation none·'
              f'transition 0s: {moving}; 카드 {details}')
    changed_boxes = [(i, c['box'], later[i]['box']) for i, c in enumerate(first)
                     if i < len(later) and c['box'] != later[i]['box']]
    if changed_boxes:
        print(f"INFO {label} 카드 사각형 변화 {changed_boxes}; "
              f"배치 기준 최초 {record['first']['layout']}; "
              f"180ms {record['later']['layout']}; 중간 크기 변화 "
              f"{record['layoutChanges']}", flush=True)
    checks.ok(len(first) == len(later) and
              (not changed_boxes or bool(record['layoutChanges'])),
              f'{label} 배치 기준 크기 변화 없는 카드 위치·크기 변화 0; 카드 {details}')
    checks.ok(record['later']['at'] > record['first']['at'],
              f'{label} 서로 다른 두 시각의 표본')
    geometry(checks, page, label + ' 최초', mobile, first)
    if not forecast and forecast_names:
        # W4b 7항: 계획 때 예보로 본 내 도시 사건만 앞·뒷면을 갖는다.
        events = [c for c in first if c['tag'] == '사건' and
                  c['title'] in forecast_names]
        # compact의 아직 넘기지 않은 카드도 면 자체의 숨김/회전을 확인한다.
        checks.ok({c['title'] for c in events} == set(forecast_names) and
                  all(c['frontHidden'] and c['backFinal'] for c in events) and
                  all(c['frontHidden'] and c['backFinal']
                      for c in later if c['tag'] == '사건' and
                      c['title'] in forecast_names),
                  f'{label} 예보로 본 사건은 등장 즉시 예보 면 숨김·확정 면만; '
                  f'카드 {details}')


def inspect_cards(checks, page, names, forecast, label, mobile, reduced,
                  forecast_names=(), forecast_range_names=()):
    state = observe(page)
    details = card_details(state['cards'])
    flag = 'forecastOpen' if forecast else 'cardsOpen'
    checks.ok((state['fx'] or {}).get(flag) is True,
              f'{label} {flag} === true; 카드 {details}')
    tag = '사건 예보' if forecast else '사건'
    cards = [c for c in state['cards'] if c['tag'] == tag]
    checks.ok(sorted(c['title'] for c in cards) == sorted(names),
              f'{label} 자료의 사건 제목과 카드 제목 일치: {names}; 카드 {details}')
    if not forecast:
        # W4b 7항: 해당 여부는 결과 구현의 면 유무가 아니라 계획 단계에서
        # 실제 화면에 확인한 예보 제목으로 판정한다. 다른 도시 사건은 단면이다.
        predicted = [c for c in cards if c['title'] in forecast_names]
        # 이 브리프 2항: 일정 사건/fc 없는 사건은 evReveal의 예보→확정
        # 문장이 없다. 계획 때 실제 본 big에 ~ 또는 ±가 있던 사건만 검사한다.
        # 면 유무·제목 검사는 범위 없는 예보까지 기존대로 유지한다.
        ranged = [c for c in predicted if c['title'] in forecast_range_names]
        if forecast_range_names:
            checks.ok({c['title'] for c in ranged} == set(forecast_range_names) and
                      all('확정' in (c['body'] or '') for c in ranged),
                      f'{label} 범위 예보로 본 내 도시 사건의 확정 면 문장에 확정: '
                      f'{sorted(forecast_range_names)}; 카드 {details}')
        else:
            print(f'SKIP {label} 계획 때 본 범위 예보 없음: 확정 문장 검사 미실행',
                  flush=True)
        checks.ok(all(c['frontTitle'] == c['title'] for c in predicted) and
                  all(c['frontTitle'] is None and not c['hasBack']
                      for c in cards if c['title'] not in forecast_names),
                  f'{label} 예보로 본 사건은 앞·뒷면 제목 동일·나머지는 단면; '
                  f'카드 {details}')
    if reduced:
        reduced_entry(checks, page, state['round'], forecast, label, mobile, forecast_names)

    # compact/paged는 결산 카드 다음에 사건 카드가 있다. 숨은 DOM만 읽고
    # 통과시키지 않고, 실제 이전/다음 단추로 모든 카드를 화면에 표시한다.
    count = len(state['cards'])
    reached, range_names = set(), set()
    current = state['cards']
    for step in range(count):
        page.wait_for_timeout((1100 + (count - 1) * 260 if step == 0 else 1000)
                              if not reduced else 40)
        current = observe(page)['cards']
        geometry(checks, page, f'{label} {step + 1}면', mobile, current)
        for c in current:
            if c['visible'] and c['tag'] == tag:
                reached.add(c['title'])
                if forecast and any(mark in c['big'] for mark in ('~', '±')):
                    range_names.add(c['title'])
                if reduced and not forecast and c['title'] in forecast_names:
                    checks.ok(c['backVisible'] and not c['frontVisible'],
                              f"{label} {c['title']} 확정 면만 표시; "
                              f'카드 {card_details(current)}')
        following = page.locator('.fx-turn-card:visible .fx-turn-card-nav').get_by_role(
            'button', name='다음', exact=True)
        visible_next = [following.nth(i) for i in range(following.count())
                        if following.nth(i).is_visible() and following.nth(i).is_enabled()]
        if not visible_next:
            break
        visible_next[0].click()
    checks.ok(reached == set(names),
              f'{label} 모든 사건 카드를 실제 화면에서 확인: {sorted(reached)}; '
              f'카드 {card_details(current)}')
    return reached, range_names


def remains_closed(page, milliseconds=500):
    return page.evaluate("""async ms => {
      const end=performance.now()+ms;
      do {
        if (KCP.fxTurn?.state?.().forecastOpen !== false) return false;
        await new Promise(resolve => requestAnimationFrame(resolve));
      } while (performance.now()<end);
      return true;
    }""", milliseconds)


def dismiss_forecast(checks, page, state, label, reload_check):
    page.keyboard.press('Escape')
    checks.test(f'{label} Esc로 예보 닫힘', lambda: bool(page.wait_for_function(
        '() => KCP.fxTurn?.state?.().forecastOpen === false', timeout=1000)))
    if not reload_check:
        return
    before = len(page.evaluate('() => window.__fxEventProbe'))
    page.locator('.lg-bar [data-panel="city"]').click()
    page.wait_for_function("() => document.querySelector('#lg-panel')?.hidden === false")
    checks.ok(remains_closed(page), f'{label} 같은 달 도시 서랍 열어도 재표시 0')
    close_drawer(page)
    checks.ok(remains_closed(page) and
              len(page.evaluate('() => window.__fxEventProbe')) == before,
              f'{label} 서랍 닫은 뒤에도 같은 달 새 카드 0')
    # 저장 지연은 .claude/rules/tests.md의 400ms를 따른다.
    page.wait_for_timeout(400)
    page.reload()
    page.wait_for_function(BOOT_JS)
    page.locator('#lg-bar').wait_for(state='visible', timeout=30000)
    restored = wait_state(page, state['round'], ['plan'])
    checks.ok(restored['room'] == state['room'] and restored['team'] == state['team'] and
              restored['count'] == state['count'] and restored['events'] == state['events'],
              f'{label} 새로고침 뒤 같은 방·도시·달·사건 복원')
    checks.ok(remains_closed(page) and not page.evaluate('() => window.__fxEventProbe.length'),
              f'{label} 명세 1절: 새로고침 뒤에도 예보 재표시 금지')
    # 재표시 회귀가 있어도 같은 사건의 결과 검사는 계속한다.
    if (observe(page)['fx'] or {}).get('forecastOpen'):
        page.keyboard.press('Escape')


def outside_click(checks, page, label):
    # W4 1절: 조작을 막지 않아야 한다. 자료 지도 단추는 리그의 닫힌
    # details.lg-map-views 안에 있으므로, 항상 보이는 도구 막대 단추로
    # force/dispatch_event 없이 원래 대상의 aria-expanded 변화를 확인한다.
    buttons = page.locator('#bd-pm')
    target = next((buttons.nth(i) for i in range(buttons.count())
                   if buttons.nth(i).is_visible() and buttons.nth(i).is_enabled()), None)
    if target is None:
        checks.ok(False, f'{label} 클릭 전달 검사에 필요한 보이는 정책·결과 단추 없음')
        return
    before = target.get_attribute('aria-expanded')
    checks.ok((observe(page)['fx'] or {}).get('cardsOpen') is True,
              f'{label} 도구 막대 클릭 직전 사건 카드 열림')
    target.click()
    after = target.get_attribute('aria-expanded')
    checks.ok(before in ('true', 'false') and after in ('true', 'false') and after != before,
              f'{label} 카드 밖 도구 막대 #bd-pm 클릭이 원래 대상에 전달')
    checks.test(f'{label} 바깥 클릭으로 카드 닫힘', lambda: bool(page.wait_for_function(
        '() => KCP.fxTurn?.state?.().cardsOpen === false', timeout=1000)))
    if after != before:
        target.click()  # 검사에서 연 서랍은 같은 화면 단추로 원래 상태로 돌린다.


def run_case(checks, page, base, label, mobile, reduced):
    page.goto(base + '#league')
    page.wait_for_function(BOOT_JS)
    checks.ok(page.evaluate('() => localStorage.length') == 0, f'{label} 빈 저장소')
    start_solo(page, months=12)
    state = wait_state(page, 1, ['plan'])
    checks.ok(state['months'] == 12, f'{label} 혼자 하기 12달')
    checks.ok(state['setMapMood'] and all(key in (state['fx'] or {})
              for key in ('forecastOpen', 'mood', 'cardsOpen')),
              f'{label} fxTurn 공개 상태와 buildGame.setMapMood 존재')
    seen, saw_forecast, saw_result, saw_empty = set(), False, False, False
    for month in range(1, 13):
        state = wait_state(page, month, ['plan'])
        prefix = f'{label} {month}월'
        mine = [e['name'] for e in state['events'] if e['mine']]
        forecast_names = set()
        forecast_range_names = set()
        mood(checks, state, prefix + ' 계획', seen)
        if mine:
            forecast_names, forecast_range_names = inspect_cards(
                checks, page, mine, True, prefix + ' 예보', mobile, reduced)
            if not saw_forecast:
                screenshot(checks, page, f'fx-event-{label}-forecast.png')
            dismiss_forecast(checks, page, state, prefix, not saw_forecast)
            saw_forecast = True
            mood(checks, observe(page), prefix + ' 예보 닫은 뒤', seen)
        else:
            checks.ok((state['fx'] or {}).get('forecastOpen') is False and
                      not any(c['tag'] == '사건 예보' for c in state['cards']),
                      f'{prefix} 내 도시 사건 없는 달 예보 열림 0')
            if not state['events']:
                saw_empty = True
        # 첫 달 코치도 최초 카드 겹침 검사에 포함한 다음 화면 단추로 닫는다.
        coach = page.locator('#lg-guide-close')
        if coach.count() and coach.is_visible():
            coach.click()
        result = click_progress(page, observe(page))
        checks.ok(result['round'] == month and result['resultRound'] == month and
                  result['count'] == month, f'{prefix} 화면 단추 → 같은 달 결과')
        mood(checks, result, prefix + ' 결과/재생', seen)
        # 일반 재생은 Esc 한 번으로 끝내고 요약→카드는 자연 타이머로 기다린다.
        if (result['fx'] or {}).get('playing'):
            page.keyboard.press('Escape')
        if result['resultEvents']:
            page.wait_for_function('() => KCP.fxTurn?.state?.().cardsOpen === true',
                                   timeout=WAIT)
            wait_unfolded(page)
            names = [e['name'] for e in result['events'] if e['id'] in result['resultEvents']]
            if mine:
                checks.ok(all(name in names for name in mine),
                          f'{prefix} 예보한 내 도시 사건이 같은 달 결과에도 존재')
            inspect_cards(checks, page, names, False, prefix + ' 확정', mobile, reduced,
                          forecast_names=forecast_names,
                          forecast_range_names=forecast_range_names)
            if not saw_result:
                screenshot(checks, page, f'fx-event-{label}-confirmed.png')
                outside_click(checks, page, prefix)
            else:
                page.keyboard.press('Escape')
            saw_result = True
        else:
            checks.ok((observe(page)['fx'] or {}).get('cardsOpen') is False,
                      f'{prefix} 사건 없는 결과 cardsOpen false')
            page.keyboard.press('Escape')
        overflow(checks, page, prefix + ' 결과')
        if month < 12:
            click_progress(page, observe(page))
    if not saw_forecast:
        print(f'SKIP {label} 내 도시 자연 사건 없음: 예보·Esc·중복·새로고침 검사 미실행', flush=True)
    if not saw_result:
        print(f'SKIP {label} 자연 사건 결과 없음: 확정·뒤집힘·클릭 전달 검사 미실행', flush=True)
    if not saw_empty:
        print(f'SKIP {label} 사건 없는 달을 만나지 못함: 해당 mood null 사례 미실행', flush=True)
    for key in EVENT_MOOD:
        if key not in seen:
            print(f'SKIP {label} {key}: 단독/우선 사건으로 관측되지 않아 표 항목 미실행', flush=True)


class MotionBrowser:
    """econui의 밝음/네트워크 격리에 생성 시 reduced-motion 설정을 더한다."""

    def __init__(self, browser, reduced):
        self.browser = browser
        self.reduced = reduced

    def new_context(self, **options):
        return self.browser.new_context(
            reduced_motion='reduce' if self.reduced else 'no-preference', **options)


def main():
    checks = Checks()
    try:
        base = local_address(sys.argv)
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                for width, height in ((1280, 900), (390, 844)):
                    for reduced in (False, True):
                        label = f'{width}x{height}-light-' + ('reduce' if reduced else 'motion')
                        print(f'INFO {label} 자연 사건 탐색(최대 12달)', flush=True)
                        context, external = context_for(MotionBrowser(browser, reduced),
                                                        base, width, height, 'light')
                        context.add_init_script(PROBE_JS)
                        page, events = monitored_page(context)
                        try:
                            run_case(checks, page, base, label, width == 390, reduced)
                        except Exception as exc:
                            checks.ok(False, f'{label} 진행 예외 {type(exc).__name__}: '
                                      f'{str(exc).splitlines()[0][:200]}')
                            screenshot(checks, page, f'fx-event-{label}-failure.png')
                        finally:
                            overflow(checks, page, label + ' 마지막 화면')
                            diagnostics(checks, events, label)
                            checks.ok(not external, f'{label} 외부 연결 시도 0: {external}')
                            context.close()
            finally:
                browser.close()
    except Exception as exc:
        checks.ok(False, f'실행 예외 {type(exc).__name__}: {str(exc).splitlines()[0][:200]}')
    return checks.finish()


if __name__ == '__main__':
    sys.exit(main())
