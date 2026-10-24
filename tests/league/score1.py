"""지시서 T F1~F13 화면 계약. 작성 세션은 실행하지 않고 py_compile만 수행한다.

실행 담당자: tests/.venv/bin/python tests/league/score1.py <loopback index.html 주소>
1280×900, 1024×768, 390×844. 도시/설비 이름과 사건은 자료/기존 씨앗에서만 읽는다.
F4 이름 목록 경계, F6 예산/규칙 후보/1600ms, F3 숫자·옛 기록, F13 자릿수 경계는
score1-node.js와 d82ux-node.js에서 합성 입력으로 검사한다. 해당 경계는 화면에서
예산·달력·후보 수를 동시에 조작해야 하므로 단위 검사로 분리했다.
"""

import json
import sys

from playwright.sync_api import sync_playwright

from econui import (BOOT_JS, Checks, advance, context_for, diagnostics, local_address,
                    mission_status, monitored_page, open_panel, overflow, setup_pair, shown)
from league_flow import finish_trial, wait_unfolded
from fx_event import restore_fixture, seeded_fixtures
from s8n import answer, ready
from solo import click_next, close_drawer, read


SCENES = ('근거 하나', '자리 판단', '자리 판단', '시험 1주', '약속',
          '예측 대 실제', '원인 하나', '다음 달')
UNCITED = '미달성 예정 · 지난달 유지 이유에 결과 숫자나 원인이 없었어요(다음엔 넣어요)'


def require(checks, condition, name):
    if not checks.ok(condition, name):
        raise AssertionError(name)


def frames(page):
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')


def area(page, left, right):
    return page.evaluate("""([left,right]) => {
      const a=document.querySelector(left), b=document.querySelector(right);
      if(!a || !b) throw Error('교차 검사 대상 없음: '+left+' / '+right);
      const x=a.getBoundingClientRect(), y=b.getBoundingClientRect();
      return Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*
        Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top));
    }""", [left, right])


def arm_review(page):
    # F5 결과 직후를 Python 왕복 전에 관찰한다. 검사용 관찰자만 추가하며 상태는 바꾸지 않는다.
    page.evaluate("""() => {
      window.__score1FirstReview=null;
      const probe=()=>{
        const root=document.querySelector('#bd-root');
        if(root?.dataset.lgPhase==='review') {
          const a=document.querySelector('#lg-map-result'), b=document.querySelector('#bd-run');
          if(a && b) {
            const x=a.getBoundingClientRect(), y=b.getBoundingClientRect();
            // 재생 중 내내 재생 패널과 하단 도구줄의 최대 교차를 기록한다(독립 검토 major 2).
            const dd=document.querySelector('#bd-dock')?.getBoundingClientRect();
            if(dd && !b.hidden && y.width>0 && y.height>0) window.__score1DockMax=Math.max(window.__score1DockMax||0,
              Math.max(0,Math.min(dd.right,y.right)-Math.max(dd.left,y.left))*Math.max(0,Math.min(dd.bottom,y.bottom)-Math.max(dd.top,y.top)));
            // F5는 결과 요약이 실제로 표시된 첫 순간을 검사한다(재생 중 visibility:hidden이면 아직 표시 전).
            if(!(x.width > 0 && x.height > 0) || getComputedStyle(a).visibility === 'hidden') return;
            // 독립 검토 major 2: 재생 패널이 하단 도구줄(#bd-dock)로 자리만 옮겨 덮지 않는지도 같은 순간에 잰다.
            const d=document.querySelector('#bd-dock')?.getBoundingClientRect();
            const runShown=!b.hidden && y.width>0 && y.height>0;
            window.__score1FirstReview={area:Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*
              Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)),mapHeight:x.height,
              runShown, dockArea: d && runShown ? Math.max(0,Math.min(d.right,y.right)-Math.max(d.left,y.left))*
              Math.max(0,Math.min(d.bottom,y.bottom)-Math.max(d.top,y.top)) : 0};
            observer.disconnect();
          }
        }
      };
      const observer=new MutationObserver(probe);
      observer.observe(document,{attributes:true,childList:true,subtree:true});
      probe();
      const B=KCP.buildGame, original=B.setViewInset;
      window.__score1Insets=[];
      window.__score1InsetAPI=typeof original==='function';
      if(typeof original==='function') B.setViewInset=function(value) {
        window.__score1Insets.push({...value});
        return original.apply(this,arguments);
      };
    }""")


def first_result(checks, page, tested, label, width):
    page.wait_for_selector('#bd-root[data-lg-phase="review"]')
    page.wait_for_function("() => !document.documentElement.classList.contains('bd-running')")
    wait_unfolded(page)
    frames(page)
    if width == 1024:
        page.wait_for_function('() => !!window.__score1FirstReview')
        first = page.evaluate('window.__score1FirstReview')
        checks.ok(first['mapHeight'] > 0 and first['area'] == 0,
                  label + ' F5 결과 직후 지도 요약/재생 패널 교차 0')
        checks.ok(first.get('dockArea', 0) == 0 and (page.evaluate('window.__score1DockMax||0') == 0),
                  label + f" F5 결과 직후 재생 패널/하단 도구줄 교차 0 (재생 패널 표시 {first.get('runShown')})")
    open_panel(page, 'result')
    checks.ok(area(page, '#lg-map-result', '#bd-run') == 0,
              label + ' F5 결과 서랍 지도 요약/재생 패널 교차 0')
    # F5(나) '비교했어요' 이동은 적용하지 않았다(측정상 스크롤 수 증가, score1 갈래 보고) — 단언 없음.
    styles = page.evaluate("""() => {
      const r=getComputedStyle(document.querySelector('#lg-ready'));
      return {ready:r.backgroundColor, trials:[...document.querySelectorAll('.bd-go[data-run]')].map(n=>{
        const s=getComputedStyle(n);return {image:s.backgroundImage,shadow:s.boxShadow};})};
    }""")
    checks.ok(styles['ready'] == 'rgb(236, 208, 131)', label + ' F2 결과 주 동작 금색')
    checks.ok(bool(styles['trials']) and all(t['image'] == 'none' and t['shadow'] == 'none'
              for t in styles['trials']), label + ' F2 결과 시험 단추 그라데이션/그림자 없음')
    cells = page.locator('#lg-result-deltas > div').evaluate_all("""nodes => nodes.map(n=>({
      title:n.querySelector('dt')?.textContent, small:n.querySelector('small')?.textContent}))""")
    headings = ('정전(이번 달)', '정전 시간(이번 달)', '생산 CO₂(이번 달)')
    basis = '시험 1주 대비' if tested['days'] == 7 else f"시험 {tested['days']}일 대비"
    checks.ok(all(sum(c['title'] == h for c in cells) == 1 for h in headings) and
              all(next(c for c in cells if c['title'] == h)['small'].startswith(basis) for h in headings),
              label + ' F3 첫 결과 세 기준 이름 일치/생산 CO₂ 이름')
    # co2(소비)만 있는 옛 시험과 신규 co2Prod 기준은 Node에서 별도 검산한다.
    require(checks, isinstance(tested.get('co2Prod'), (int, float)),
            label + ' F3 새 시험 기록은 생산 co2Prod 보존')
    if width == 1280:
        checks.ok(page.evaluate('window.__score1InsetAPI === true') and page.evaluate(
            'window.__score1Insets.some(v => Number.isFinite(v.right) && v.right > 0)'),
            label + ' F10 공개 setViewInset을 결과 서랍 열기에 호출')
        # 공개 API에 변환 뒤 viewport 경계 조회 함수가 없으므로 T 허용 대안인 존재/호출로 판정.
        # 사설 변수/그리기 수식에서 기대 좌표를 복제하지 않는다.
        texts = page.locator('#lg-panel #lg-timeline svg text').evaluate_all(
            'nodes => nodes.map(n => n.getBoundingClientRect().height)')
        # 첫 달 결과 서랍에는 월별 추이(#lg-timeline)가 아직 없다. 있으면 축 글자를 재고,
        # 채점자가 지목한 끝 화면 궤적 그래프(서랍 안)는 fx_end.py 'F12 결과 서랍 끝 그래프 축'이 잰다.
        checks.ok(not texts or min(texts) >= 10,
                  label + f' F12 결과 서랍 월별 추이 축 화면 높이 10px 이상(글자 {len(texts)}개, 0개면 끝 화면은 fx_end.py)')
    open_panel(page, 'rank')
    page.emulate_media(media='print')
    try:
        colors = page.locator('#lg-rank').evaluate("""el => {
          const s=getComputedStyle(el); return [s.backgroundColor,s.color];
        }""")
        checks.ok(colors == ['rgb(255, 255, 255)', 'rgb(0, 0, 0)'],
                  label + ' F12 인쇄 순위 카드 흰 바탕/검은 글자')
    finally:
        page.emulate_media(media='screen')
    overflow(checks, page, label + ' 결과')


def grant(checks, page, before, label, width):
    close_drawer(page)
    frames(page)
    value = page.evaluate("""() => {
      const L=KCP.league.state(), V=L.S||L.snap, C=KCP.leagueCore;
      return C.grantOf(V,C.regionOf(V.region),L.team,KCP.buildGame).left;
    }""")
    require(checks, value > 0, label + ' F1 자연 교부세 달 확보')
    text = f'이번 달 특별교부세 {value:g}억(새 설비·선로·재난 대응만)'
    if width <= 760:
        after = page.locator('#lg-bar').bounding_box()
        checks.ok(before == after, label + ' F1 390 교부세 유무 막대 사각형 불변')
        tip = page.locator('details.lg-info.lg-money-info')
        require(checks, tip.count() == 1 and tip.is_visible(), label + ' F1 남은 돈 옆 설명')
        checks.ok(tip.locator(':scope > summary').inner_text() == '!', label + ' F1 설명 summary !')
        tip.locator(':scope > summary').click()
        checks.ok(text == tip.locator('.lg-info-pop').inner_text(), label + ' F1 설명 확정 교부세 문구')
        money = page.locator('[data-cap="budget"]').bounding_box()
        summary = tip.locator(':scope > summary').bounding_box()
        checks.ok(bool(money) and bool(summary) and
                  money['x'] <= summary['x'] <= money['x'] + money['width'] and
                  money['y'] <= summary['y'] + summary['height']/2 <= money['y'] + money['height'],
                  label + ' F1 !은 남은 돈 칩 옆')
        # 독립 검토 major 1: '!' 누름 영역 전체가 금액 글자와 겹치지 않아야 한다.
        checks.ok(area(page, 'details.lg-money-info > summary', '[data-cap="budget"] [data-v]') == 0,
                  label + ' F1 ! 누름 영역과 남은 돈 금액 글자 교차 0')
        tip.locator(':scope > summary').click()
    else:
        checks.ok(text in page.locator('[data-cap="budget"] .lg-grant-note').inner_text(),
                  label + ' F1 760px 초과 칩 주석 유지')
    overflow(checks, page, label + ' 교부세 달')


def forecast(checks, page, label, width):
    page.wait_for_function('() => KCP.fxTurn?.state?.().forecastOpen === true')
    frames(page)
    cards = page.locator('.fx-turn-cards article[data-forecast="true"]')
    require(checks, cards.count() > 0, label + ' F9 2월 예보 카드 확보')
    if width == 1280:
        # Python 왕복 중 짧은 알림이 사라져 공허한 교차 0이 되지 않도록 미리 수집한 실제 프레임.
        page.wait_for_function('() => !!window.__score1PlanAreas')
        overlaps = page.evaluate('window.__score1PlanAreas')
        checks.ok(bool(overlaps) and all(x == 0 for x in overlaps), label + ' F9 2월 알림/예보 교차 0')
    for i in range(cards.count()):
        h = cards.nth(i).locator('h3')
        checks.ok(h.locator('span.bd-event-icon[aria-hidden="true"]').count() == 1 and
                  h.locator('span:not(.bd-event-icon)').count() == 1,
                  label + ' F9 예보 h3 기호/제목 span')


def arm_plan_notice(page):
    page.evaluate("""() => {
      window.__score1PlanAreas=null;
      const sample=()=>{
        const L=KCP.league.state(), V=L.S||L.snap, t=document.querySelector('#bd-toast');
        const cards=[...document.querySelectorAll('.fx-turn-cards article[data-forecast="true"]')];
        const visible=n=>n?.checkVisibility({opacityProperty:true,visibilityProperty:true}) &&
          n.getBoundingClientRect().width>0 && n.getBoundingClientRect().height>0;
        if(V.round===2 && V.phase==='plan' && visible(t) && cards.length &&
          cards.every(c=>visible(c) && Number(getComputedStyle(c).opacity)===1)) {
          const x=t.getBoundingClientRect();
          window.__score1PlanAreas=cards.map(c=>{
            const y=c.getBoundingClientRect();
            return Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*
              Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top));
          });
        } else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }""")


def solo_case(checks, context, base, fixture, width, pages):
    label = f'{width} score1'
    page, events = monitored_page(context)
    pages.append((events, label))
    restore_fixture(checks, page, base, label, fixture)
    # 코치의 전체 8장면·3단계 목록은 Node/ux_coach가 담당한다.
    coach = page.locator('#lg-coach')
    if coach.count():
        step = int(coach.get_attribute('data-step'))
        checks.ok(page.locator('#lg-coach-task').inner_text().startswith(f'{SCENES[step-1]} · {step}/8 '),
                  label + ' F4 첫 코치 장면 이름/순서')
        page.locator('#lg-coach-close').click()
    close_drawer(page)
    before = page.locator('#lg-bar').bounding_box()
    checks.ok(not shown(page, '.lg-money-info'), label + ' F1 교부세 없는 1월 설명 없음')
    overflow(checks, page, label + ' 첫 계획')
    page.locator('[data-run="7"]').click()
    tested = finish_trial(page)
    page.locator('#bd-drawer-x').click()
    arm_review(page)
    ready(page)
    first_result(checks, page, tested, label, width)
    # 다음 달 계획에 지난달 이유를 고치라고 요구하지 않는 uncited 계약.
    answer(page, 'keep', '유지해요')
    page.wait_for_timeout(400)  # 저장 debounce 250ms; tests.md의 400ms 경계.
    state = read(page)['S']
    if width == 1280:
        arm_plan_notice(page)
    click_next(page, state)
    page.wait_for_function("() => KCP.league.state().S.round===2 && KCP.league.state().S.phase==='plan'")
    forecast(checks, page, label, width)
    # 예보 기호를 먼저 검사한 뒤 알림/카드 닫힘이 HUD 측정에 끼지 않게 실제 닫기 조작.
    page.keyboard.press('Escape')
    grant(checks, page, before, label, width)
    ready(page, submit=False)  # 지난달 미션은 다음 달 약속 카드의 계획 미리보기에서 읽는다.
    mission = page.locator('#lg-previous-mission')
    require(checks, mission.count() == 1, label + ' F13 지난달 미션 존재')
    mission_status(checks, page, UNCITED, label + ' F13 uncited 확정 문구', '#lg-previous-mission', preview=True)
    overflow(checks, page, label + ' 다음 달')


def host_case(checks, context, base, fixture, pages):
    # setup_pair의 도시 선택/로컬 연결 흐름을 재사용한다. 자료에서 만든 lobby 사본만 복원한다.
    saved = fixture['save']['state']
    spec = {'room': saved['room'], 'region': saved['region'], 'ids': list(saved['teams'])}
    seed = """() => {
      const spec=%s, C=KCP.leagueCore, ids=spec.ids, net={kind:'local'};
      const S=C.newState(spec.room,spec.region,Date.now(),ids,{turns:12,seedMode:'room'});
      // F7 글꼴 fixture: 첫 장부에도 위험 기호가 반드시 생기도록 가상 재정만 음수로 둔다.
      // 실제 사용자 자료/운영 저장소가 아닌 새 BrowserContext의 시작 사본이다.
      S.econ.cities[ids[0]].cash = -S.econ.cities[ids[0]].debtCap - 10000;
      C.reduce(S,{type:'claim',team:ids[1],token:'score1-fixture-computer'},Date.now(),KCP.buildGame);
      localStorage.setItem('kcp-league-net-v1',JSON.stringify(net));
      localStorage.setItem('kcp-league-host-v1',JSON.stringify({room:S.room,net,state:S}));
      return {room:S.room,ids,team:ids[0]};
    }""" % json.dumps(spec, ensure_ascii=False)
    pair = []
    try:
        host, team, _ = setup_pair(context, base, 12, pair, seed_js=seed)
        advance(host, team, 1, 'plan')
        advance(host, team, 1, 'review')
        host.locator('#lg-host-details').evaluate('el => {el.open=true}')
        for selector in ('.lg-warning-symbol', '.lg-evnote', '.lg-data-chip > span'):
            values = host.locator(selector).evaluate_all('nodes => nodes.map(n=>parseFloat(getComputedStyle(n).fontSize))')
            checks.ok(bool(values) and min(values) >= 14, f'1280 F7 진행자 {selector} 계산 글꼴 14px 이상')
        overflow(checks, host, '1280 진행자')
        overflow(checks, team, '1280 진행자에 연결한 팀')
    finally:
        pages.extend((events, '진행자 ' + label) for _, events, label in pair)


def main():
    checks = Checks()
    try:
        base = local_address(sys.argv)
        fixture = seeded_fixtures()[0]  # 자연 추첨 1월 비지급/2월 폭설. 기대 사건은 기존 독립 씨앗 표.
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                for width, height in ((1280,900),(1024,768),(390,844)):
                    context, external = context_for(browser, base, width, height, 'light')
                    pages = []
                    try:
                        checks.test(f'{width} 전체 장면 예외 0',
                                    lambda: (solo_case(checks,context,base,fixture,width,pages), True)[1])
                    finally:
                        for events, label in pages:
                            diagnostics(checks,events,label)
                        checks.ok(not external, f'{width} 외부 요청 0')
                        context.close()
                context, external = context_for(browser,base,1280,900,'light')
                pages = []
                try:
                    checks.test('진행자 장면 예외 0', lambda: (host_case(checks,context,base,fixture,pages),True)[1])
                finally:
                    for events,label in pages:
                        diagnostics(checks,events,label)
                    checks.ok(not external,'진행자 외부 요청 0')
                    context.close()
            finally:
                browser.close()
    except Exception as e:
        checks.ok(False,f'검사 준비 예외: {type(e).__name__}: {e}')
    return checks.finish()


if __name__ == '__main__':
    sys.exit(main())
