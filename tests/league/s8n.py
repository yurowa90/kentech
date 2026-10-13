"""S8N 명세 기반 수용 검사. 브라우저 실행은 샌드박스 밖 로컬 담당자 전용.

실행: tests/.venv/bin/python tests/league/s8n.py http://127.0.0.1:9430/index.html
기준: _briefs/lanes/league/S8N-next.md:9–17, D-65:3,20.
기대값은 명세와 직접 한 조작에서 정한다. UI 계산/판정 함수는 호출하지 않는다.
시작 fixture의 rounds만 3/2달로 단축한다. 결과·약속·판정은 주입하지 않는다.
AUTO 문자열을 평가하지 않는다. 계획 변경은 공개 검사 API를 사용한다.
"""

from league_flow import pass_issue_check
import re
import sys

from playwright.sync_api import expect, sync_playwright
from econui import (Checks, context_for, diagnostics, local_address, monitored_page,
                   open_panel, overflow, screenshot, setup_pair, SEED_JS, shown)
from league_flow import select_mode, start_solo
from solo import close_drawer, click_next

STATE = "() => {const l=KCP.league.state(); return l.S || l.snap;}"
SYNC = "([r,p]) => {const l=KCP.league.state(),s=l&&(l.S||l.snap);return s?.round===r&&s?.phase===p;}"
NOTES = """() => {
  const l=KCP.league.state();
  const d=l.role==='solo' ? JSON.parse(localStorage.getItem('kcp-league-solo-v1')).interview :
    JSON.parse(localStorage.getItem(`kcp-league-data-v1:${l.room}:${l.team}`));
  return d?.interview?.months || {};
}"""
PUBLIC = """() => {const l=KCP.league.state();
  const v=structuredClone(l.snap || KCP.leagueCore.publicView(l.S,0));delete v.now;return v;}"""
DIRECTIONS = {'up': '늘 것', 'down': '줄 것', 'same': '같을 것'}
REASON = '가상검사 사과나무 선택을 이어 간다'

# 관찰 전용 Canvas 계측: 실제 draw 명령과 measureText의 ink bounds를 기록.
# 선 위치를 재계산하거나 렌더러의 labelEdge/색상 상수를 복제하지 않는다.
CANVAS = """(() => {
  const p=CanvasRenderingContext2D.prototype, records=new WeakMap();
  window.__s8nCanvas=canvas=>records.get(canvas)||{texts:[],arrows:[]};
  const get=c=>{if(!records.has(c.canvas)) records.set(c.canvas,{texts:[],arrows:[]});return records.get(c.canvas);};
  for(const name of ['clearRect','beginPath','moveTo','lineTo','stroke','fill','fillText']) {
    const original=p[name];
    p[name]=function(...a) {
      if(this.canvas.id==='lg-mapc') {
        const r=get(this), m=this.getTransform(), pt=(x,y)=>{const q=new DOMPoint(x,y).matrixTransform(m);return [q.x,q.y];};
        if(name==='clearRect') {r.texts=[];r.arrows=[];r.path=[];r.last=null;}
        if(name==='beginPath') r.path=[];
        if(name==='moveTo'||name==='lineTo') (r.path ||= []).push(pt(a[0],a[1]));
        if(name==='stroke') r.last=(r.path||[]).map(q=>q.slice());
        if(name==='fill' && r.path?.length===3 && r.last?.length===2 &&
          Math.hypot(r.path[0][0]-r.last[1][0],r.path[0][1]-r.last[1][1])<.01) r.arrows.push(r.last);
        if(name==='fillText') {
          const t=this.measureText(a[0]), pad=this.lineWidth/2;
          const lo=pt(a[1]-t.actualBoundingBoxLeft-pad,a[2]-t.actualBoundingBoxAscent-pad);
          const hi=pt(a[1]+t.actualBoundingBoxRight+pad,a[2]+t.actualBoundingBoxDescent+pad);
          r.texts.push({text:String(a[0]),x:lo[0],y:lo[1],right:hi[0],bottom:hi[1]});
        }
      }
      return original.apply(this,a);
    };
  }
})();"""


def require(checks, value, label):
    if not checks.ok(value, label):
        raise AssertionError(label)


def capture(checks, page, label):
    overflow(checks, page, label)
    screenshot(checks, page, 's8n-' + label + '.png')


def next_phase(page, month, phase):
    close_drawer(page)
    if page.evaluate("() => KCP.league.state().role") == 'solo':
        click_next(page, page.evaluate(STATE))
    else:
        page.locator('#lg-next').click()
    page.wait_for_function(SYNC, arg=[month, phase])


def trial(page):
    close_drawer(page)
    page.locator('[data-run="7"]').click()
    page.wait_for_selector('#bd-skip')
    page.locator('#bd-skip').click()
    page.wait_for_selector('#bd-res-title')
    page.locator('#bd-drawer-x').click()


def ready(page, submit=True):
    close_drawer(page)
    page.locator('#lg-ready').click()
    pass_issue_check(page)
    page.wait_for_selector('#lg-ready-confirm')
    if submit:
        page.locator('[data-evidence="grid"]').click()
        topic = page.locator('[data-pred]').first
        topic.select_option('down')
        page.locator('[data-confidence="fairly"]').click()
        page.locator('#lg-ready-confirm').click()


def answer(page, choice, reason):
    open_panel(page, 'result')
    page.locator('[data-compared]').check()
    page.locator(f'#lg-panel [data-answer="{choice}"]').click()
    page.locator('[data-note="askReason"]').fill(reason)
    page.locator('[data-note="askReason"]').press('Tab')


def achieved(page, selector='#lg-learning-mission'):
    return page.locator(selector).inner_text().split(':')[-1].strip() == '달성'


def drawer(checks, page, width, tab, result, label):
    open_panel(page, tab)
    box = page.locator('#lg-panel').bounding_box()
    require(checks, bool(box), label + ' 서랍 표시')
    if width == 1180:
        if result:
            checks.ok(.45 <= box['width'] / width <= .55,
                      label + ' 결과·일지 폭 45~55% [17]')
        else:
            # 작업 전 CSS의 기존 계획 서랍 360px. 결과 폭과 같아지는 회귀도 탐지.
            checks.ok(abs(box['width'] - 360) <= 2, label + ' 계획 폭 기존 360px [17]')
    overflow(checks, page, label)
    return box['width']


def plan(page, kind):
    return page.evaluate("""kind => KCP.league.plan(st=>{
      const B=KCP.buildGame;
      if(kind==='empty') Object.assign(st,{builds:[],lines:[],policies:[]});
      else if(kind==='lines') {
        const id=KCP.league.state().team;
        Object.assign(st,{builds:[],lines:structuredClone(KCP.ECON_DATA.normalStartPlans[id].lines),policies:[]});
      } else {
        const used=new Set(st.builds.map(b=>b.i));
        const t=B.TILES.find(t=>!t.out && t.site<0 && !used.has(t.i) && !B.siteRule('diesel',t));
        if(!t) throw Error('합법적 설비 추가 칸 없음');
        st.builds.push({t:'diesel',i:t.i});
      }
    })""", kind)


def followup(checks, page, added, mission, reason, label):
    ready(page, submit=False)
    text = page.locator('#lg-plan-followup').inner_text()
    checks.ok(all(s in text for s in ('말한 변경', '이번 달 실제 변경', reason)), label + ' 말·실제 변경 나란히 [10]')
    actual = page.locator('#lg-actual-change').inner_text()
    checks.ok(bool(re.search(rf'설비\s*{added}개\s*추가\s*·\s*0개\s*제거', actual)), label + f' 실제 설비 +{added}/-0 [10]')
    checks.ok(bool(re.search(r'전선\s*0\s*→\s*0', actual)) and '변경 없음' in actual,
              label + ' 전선·정책 변경 없음 [10]')
    checks.ok(achieved(page, '#lg-previous-mission') == mission, label + ' 지난달 미션 판정 [11]')
    checks.ok(all(s in text for s in ('다음 달', '계획', '숫자', '원인', '유지', '달성')),
              label + ' 판정 규칙을 화면에 표시 [11]')
    overflow(checks, page, label + ' 준비 관문')
    close_drawer(page)


def end_checks(checks, page, width, label):
    drawer(checks, page, width, 'result', True, label + '-끝')
    notes = page.evaluate(NOTES)
    rows = page.locator('#lg-decisions [data-decision-month]')
    expected = {str(m): n for m, n in notes.items() if n.get('evidence') or n.get('pred') or n.get('askReason')}
    checks.ok(rows.count() == len(expected) and len(expected) >= 2, label + ' 기록 있는 달마다 한 행 [12]')
    checks.ok(any(n.get('outcome') for n in expected.values()), label + ' 판정 있는 달 실제 대조 [12]')
    for month, note in expected.items():
        row = page.locator(f'#lg-decisions [data-decision-month="{month}"]')
        require(checks, row.count() == 1, label + f' {month}달 행 유일 [12]')
        text = row.inner_text()
        if note.get('evidence'):
            checks.ok(note['evidence']['text'] in text, label + f' {month}달 근거=기기 기록 [12]')
        for topic, direction in note.get('pred', {}).items():
            checks.ok(('정전' if topic == 'uns' else '현금') + ' ' + DIRECTIONS[direction] in text,
                      label + f' {month}달 예측=기기 기록 [12]')
        outcome = note.get('outcome')
        if outcome:
            checks.ok(('예상과 같음' if outcome['hit'] else '예상과 다름') in text,
                      label + f' {month}달 판정=기기 기록 [12]')
        else:
            checks.ok('→ 판정' not in text, label + f' {month}달 없는 판정 생략 [12]')
        if note.get('askReason'):
            checks.ok(note['askReason'] in text, label + f' {month}달 이유=기기 기록 [12]')
        else:
            checks.ok('바꿀 이유' not in text and '유지할 이유' not in text,
                      label + f' {month}달 없는 이유 생략 [12]')
    definition = page.locator('#lg-final-causes').inner_text()
    checks.ok(all(s in definition for s in ('누적 정전', '도시 안 부족량의 합', '그 시각 도시 수요의 2%', '넘은 시간의 합')),
              label + ' 누적 정전 정의 [13]')
    geometry = page.locator('#lg-timeline [data-change] text').evaluate_all("""nodes=>{
      const boxes=nodes.map(n=>({kind:n.parentElement.dataset.change,r:n.getBoundingClientRect()}));
      let intersections=0;
      boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>{
        if(Math.min(a.r.right,b.r.right)>Math.max(a.r.left,b.r.left) &&
           Math.min(a.r.bottom,b.r.bottom)>Math.max(a.r.top,b.r.top)) intersections++;
      })); return {kinds:boxes.map(b=>b.kind),intersections};
    }""")
    checks.ok(geometry['intersections'] == 0, label + ' 원/설/정 경계 상자 교차 0 [13]')
    capture(checks, page, label + '-끝')
    return geometry


def solo(checks, context, base, width, label, pages):
    page, events = monitored_page(context)
    pages.append((page, events, 'solo'))
    page.goto(base + '#league')
    select_mode(page, 'solo')
    page.locator('[data-select="lg-solo-city"][data-value="pyeongtaek"]').click()
    page.locator('#lg-solo .lg-extra-settings > summary').click()
    page.locator('#lg-solo-seed').select_option('fixed')
    start_solo(page)
    page.wait_for_function(SYNC, arg=[1, 'plan'])
    # 길이만 단축. 저장은 정상 계획 변경의 저장 경로로 수행한다.
    page.evaluate("() => {KCP.league.state().S.rounds.length=3;}")
    if shown(page, '#lg-guide-close'):
        page.locator('#lg-guide-close').click()
    require(checks, plan(page, 'empty'), label + ' 정전 관찰용 빈 계획')
    checks.ok(page.evaluate("() => KCP.league.state().team") == 'pyeongtaek', label + ' 평택')
    checks.ok(page.evaluate(STATE)['seedMode'] == 'fixed', label + ' 고정 날씨·사건')
    drawer(checks, page, width, 'journal', False, label + '-첫계획')
    trial(page)
    ready(page)
    page.wait_for_function(SYNC, arg=[1, 'review'])
    answer(page, 'revise', REASON)
    checks.ok(not achieved(page), label + ' 일반 이유+수정 약속은 미달성 [11]')
    drawer(checks, page, width, 'result', True, label + '-결과')
    drawer(checks, page, width, 'journal', True, label + '-일지')
    next_phase(page, 2, 'plan')
    require(checks, shown(page, '#lg-plan-reminder'), label + ' 건설 화면 지난달 띠 [9]')
    checks.ok(REASON in page.locator('#lg-plan-reminder').inner_text(), label + ' 띠에 직접 쓴 이유 [9]')
    capture(checks, page, label + '-다음달띠')
    page.locator('#lg-plan-reminder-close').click()
    page.reload()
    page.wait_for_function(SYNC, arg=[2, 'plan'])
    checks.ok(not shown(page, '#lg-plan-reminder'), label + ' 닫기 새로고침 뒤 유지 [9]')
    drawer(checks, page, width, 'journal', False, label + '-다음계획')
    checks.ok(page.locator('.lg-debt-note').inner_text() == '(빚 한도 포함)', label + ' 머리 돈 칩 설명 [14]')
    state = page.evaluate(STATE)
    require(checks, state['results'][0]['team']['pyeongtaek']['unsPct'] > state['goals']['unsPct'],
            label + ' 실제 운영 정전 목표 초과 사례')
    power = page.locator('[data-cap="power"]')
    checks.ok('tone-mint' not in (power.get_attribute('class') or ''), label + ' 다음 달 설비/피크 초록 아님 [14]')
    checks.ok(power.evaluate("""el=>{
      const probe=document.createElement('span');probe.style.color='var(--ui-mint)';el.append(probe);
      const mint=getComputedStyle(probe).color,actual=getComputedStyle(el.querySelector('[data-v]')).color;
      probe.remove();return actual!==mint;
    }"""), label + ' 설비/피크 실제 글자색도 정상 초록 아님 [14]')
    followup(checks, page, 0, False, REASON, label + '-변경전')
    before = page.evaluate("() => KCP.buildGame.current().builds.length")
    require(checks, plan(page, 'add'), label + ' 설비 실제 추가')
    checks.ok(page.evaluate("() => KCP.buildGame.current().builds.length") == before + 1, label + ' 실제 설비 정확히 1기 증가')
    followup(checks, page, 1, True, REASON, label + '-변경후')
    ready(page)
    page.wait_for_function(SYNC, arg=[2, 'review'])
    answer(page, 'keep', REASON)
    checks.ok(not achieved(page), label + ' 일반 유지 이유는 미달성 [11]')
    answer(page, 'keep', '정전 결과를 확인하여 유지한다')
    checks.ok(achieved(page), label + ' 원인 단어 인용한 유지 이유 달성 [11]')
    # 숫자는 UI 판정용 resultNumbers를 읽지 않고 실제 운영값에서 취한다.
    value = page.evaluate(STATE)['results'][-1]['team']['pyeongtaek']['unsPct']
    answer(page, 'keep', f'{round(value, 2):g} 결과를 확인하여 유지한다')
    checks.ok(not achieved(page), label + ' 단위 없는 실제 결과 숫자는 미달성 [11]')
    answer(page, 'keep', f'{round(value, 2):g}% 결과를 확인하여 유지한다')
    checks.ok(achieved(page), label + ' 실제 결과 숫자·단위 인용한 유지 이유 달성 [11]')
    answer(page, 'keep', '123456789% 결과를 확인하여 유지한다')
    checks.ok(not achieved(page), label + ' 단위가 있어도 지난 결과와 무관한 숫자는 미달성 [11]')
    answer(page, 'keep', '0')
    checks.ok(not achieved(page), label + ' 0만 쓴 이유는 미달성 [11]')
    answer(page, 'keep', '0%')
    checks.ok(not achieved(page), label + ' 0%만 쓴 이유는 미달성 [11]')
    # 37.8/37.80과 같은 정규화 동등성을 실제 운영값으로 검사한다.
    normalized = f'{value:.1f}'
    for number in (normalized, normalized + '0'):
        answer(page, 'keep', f'{number}% 결과를 확인하여 유지한다')
        checks.ok(achieved(page), label + f' 실제 결과 {number}% 표기 정규화 후 달성 [11]')
    answer(page, 'keep', '정전 결과를 확인하여 유지한다')
    next_phase(page, 3, 'plan')
    followup(checks, page, 0, True, '정전 결과를 확인하여 유지한다', label + '-유지')
    # 셋째 달에는 정책·설비 변경을 같이 만들어 타임라인 표지 겹침을 검사한다.
    require(checks, plan(page, 'add'), label + ' 셋째 달 설비 추가')
    open_panel(page, 'city')
    page.locator('[data-pol="taxRes"]').focus()
    page.locator('[data-pol="taxRes"]').press('ArrowRight')
    page.locator('[data-pol="taxRes"]').press('Tab')
    trial(page)
    ready(page)
    page.wait_for_function(SYNC, arg=[3, 'review'])
    open_panel(page, 'result')
    if shown(page, '[data-missed]'):
        page.locator('[data-missed]').first.click()
        page.locator('#lg-outage-open').click()
    # 원인 요약/공개를 UI에서 실행한 뒤 기록과 끝 행을 직접 비교한다.
    cause_text = page.locator('#lg-missed').inner_text()
    next_phase(page, 3, 'end')
    geometry = end_checks(checks, page, width, label)
    checks.ok(set(geometry['kinds']) >= {'outage', 'build', 'policy'}, label + ' 원/설/정 세 표지 실제 검사 [13]')
    note = page.evaluate(NOTES)['3']
    text = page.locator('#lg-decisions [data-decision-month="3"]').inner_text()
    basis = (note.get('outageFrozen') or note.get('missedCarry') or {}).get('basis', note.get('missedBasis'))
    names = {'choice': '내 선택', 'weather': '날씨·계절·운전 기간' if basis == 'monthly' else '날씨·운전 기간',
             'event': '사건·대응', 'trade': '이웃 거래', 'grid': '접속 대기',
             'progress': '접속·공사·기술 진행', 'growth': '도시 성장·연료 값'}
    if note.get('missed'):
        name = names.get(note['missed'])
        checks.ok(name is not None and name in text and name in cause_text, label + ' 고른 원인 기록 연결 [12]')
    if note.get('outageLargest'):
        largest = note['outageLargest']
        name = names.get(largest.get('key'))
        match = re.search(r'가장 큰 몫:\s*' + re.escape(name) + r'\s*([+−-]?[\d,.]+)\s*%p', text) if name is not None else None
        checks.ok(bool(match) and abs(float(match[1].replace(',', '').replace('−', '-')) - largest['value']) <= .0051,
                  label + ' 공개한 가장 큰 몫 이름·수치=기기 기록 [12]')
    elif note.get('outageSingleShown'):
        checks.ok('뚜렷한 원인 없음' in text and '가장 큰 몫' not in text,
                  label + ' 미미한 원인은 요약 연결·없는 최대 몫 생략 [12]')
    page.reload()
    page.wait_for_function(SYNC, arg=[3, 'end'])
    end_checks(checks, page, width, label + '-새로고침')


def private_keys(value):
    banned = {'askReason', 'outcome', 'pred', 'compared', 'answer', 'missed',
              'operatingPlan', 'followingPlanChanged', 'resultNumbers', 'outageLargest'}
    if isinstance(value, dict):
        return [key for key in value if key in banned] + [key for v in value.values() for key in private_keys(v)]
    if isinstance(value, list):
        return [key for v in value for key in private_keys(v)]
    return []


def host_geometry(checks, host, label):
    details = host.locator('#lg-host-details')
    if not details.evaluate('el=>el.open'):
        details.locator(':scope > summary').click()
    cards = host.locator('[data-host-card]')
    require(checks, cards.count() > 0, label + ' 도시 상세 존재 [16]')
    for i in range(cards.count()):
        card = cards.nth(i)
        if card.evaluate('el=>el.open'):
            card.locator(':scope > summary').click()
        sizes = card.evaluate("""el=>({box:el.getBoundingClientRect().height,
          title:el.querySelector('summary').getBoundingClientRect().height})""")
        checks.ok(0 <= sizes['box'] - sizes['title'] <= 16, label + ' 닫힌 도시 상세=제목 높이±여백16px [16]')
    geometry = host.evaluate("""() => {
      const r=window.__s8nCanvas(document.querySelector('#lg-mapc'));
      const names=Object.values(KCP.ECON_DATA.start).map(c=>c.name);
      const boxes=r.texts.filter(t=>names.includes(t.text));
      // 도시 이름·아래 정전 글자의 합집합이 이름표의 관찰된 경계다.
      for(const b of boxes) for(const t of r.texts.filter(t=>/^정전 /.test(t.text))) {
        if(Math.abs((b.x+b.right-t.x-t.right)/2)<2 && t.y>=b.y && t.y-b.bottom<2*(b.bottom-b.y)) {
          b.x=Math.min(b.x,t.x);b.right=Math.max(b.right,t.right);b.bottom=Math.max(b.bottom,t.bottom);
        }
      }
      return {boxes,arrows:r.arrows};
    }""")
    require(checks, len(geometry['arrows']) > 0 and len(geometry['boxes']) >= 2,
            label + ' 실제 이주 화살표·도시 이름표 계측 [16]')
    inside = [(x, y) for arrow in geometry['arrows'] for x, y in arrow
              if any(b['x'] <= x <= b['right'] and b['y'] <= y <= b['bottom'] for b in geometry['boxes'])]
    checks.ok(not inside, label + ' 모든 이주선 양 끝점은 도시 이름표 밖 [16]')
    capture(checks, host, label + '-지도')


def multiplayer(checks, context, base, width, label, pages):
    context.add_init_script(CANVAS)
    # 6도시로 이름 가림 사례를 보장한다. 기존 setup_pair의 로컬 참가 흐름 재사용.
    seed = SEED_JS.replace("['pyeongtaek', 'dangjin']",
                          "['pyeongtaek', ...KCP.leagueCore.regionOf('south').teams.map(t=>t.id).filter(id=>id!=='pyeongtaek')]")
    seed = seed.replace('const net =', 'S.rounds.length=2; const net =')
    host, team, _ = setup_pair(context, base, 12, pages, seed)
    next_phase(host, 1, 'plan')
    team.wait_for_function(SYNC, arg=[1, 'plan'])
    if shown(team, '#lg-guide-close'):
        team.locator('#lg-guide-close').click()
    require(checks, plan(team, 'lines'), label + ' 송전선만 있는 계획 적용')
    count = team.evaluate('() => KCP.buildGame.current().lines.length')
    require(checks, count > 0, label + ' 송전선 fixture 개수 > 0')
    host.wait_for_function('n=>KCP.league.state().S.teams.pyeongtaek.plan?.lines.length===n', arg=count)
    host.locator('#lg-host-details > summary').click()
    host.locator('#lg-host-card-pyeongtaek > summary').click()
    expect(host.locator('#lg-host-card-pyeongtaek')).to_contain_text(f'설비 건설 없음(송전선 {count})')
    checks.ok(True, label + ' 송전선 전용 도시 카드 정확한 수 [16]')
    trial(team)
    ready(team)
    host.wait_for_function('() => KCP.league.state().S.teams.pyeongtaek.ready')
    next_phase(host, 1, 'review')
    team.wait_for_function(SYNC, arg=[1, 'review'])
    open_panel(team, 'result')
    before_h, before_t = host.evaluate(PUBLIC), team.evaluate(PUBLIC)
    answer(team, 'revise', REASON)
    team.wait_for_timeout(4500)  # 정기 공개 갱신 한 주기까지 포함한다.
    after_h, after_t = host.evaluate(PUBLIC), team.evaluate(PUBLIC)
    checks.ok(before_h == after_h and before_t == after_t, label + ' 이유·비교·판정 후 공개 상태 불변 [D-65:3,20]')
    for public in (after_h, after_t):
        checks.ok(not private_keys(public), label + ' 공개 상태에 사적 이유·판정 필드 0 [D-65]')
    surface = host.locator('body').evaluate('el=>el.outerHTML')
    checks.ok(REASON not in surface and not any(s in surface for s in ('data-answer=', 'data-compared', 'askReason', '팀별 약속 판정')),
              label + ' 숨긴 DOM·속성에도 학생 이유·판정 없음 [D-65]')
    drawer(checks, team, width, 'result', True, label + '-결과')
    drawer(checks, team, width, 'journal', True, label + '-일지')
    host_geometry(checks, host, label)
    next_phase(host, 2, 'plan')
    team.wait_for_function(SYNC, arg=[2, 'plan'])
    # 지난달 운영 계획 기록이 없는 기기(오래된 저장본) 분기. 원본은 복구한다.
    stored = team.evaluate("""() => {const l=KCP.league.state(),key=`kcp-league-data-v1:${l.room}:${l.team}`;
      const raw=localStorage.getItem(key),d=JSON.parse(raw);delete d.interview.months[1].operatingPlan;
      localStorage.setItem(key,JSON.stringify(d));return {key,raw};}""")
    team.reload()
    team.wait_for_function(SYNC, arg=[2, 'plan'])
    ready(team, submit=False)
    checks.ok(team.locator('#lg-actual-change').inner_text() == '지난달 계획 기록 없음', label + ' 없는 기기 계획 추측 금지 [10]')
    team.evaluate('({key,raw})=>localStorage.setItem(key,raw)', stored)
    team.reload()
    team.wait_for_function(SYNC, arg=[2, 'plan'])
    ready(team)
    host.wait_for_function('() => KCP.league.state().S.teams.pyeongtaek.ready')
    next_phase(host, 2, 'review')
    team.wait_for_function(SYNC, arg=[2, 'review'])
    answer(team, 'keep', '현금 결과를 확인하여 유지한다')
    next_phase(host, 2, 'end')
    team.wait_for_function(SYNC, arg=[2, 'end'])
    end_checks(checks, team, width, label + '-팀')
    checks.ok(host.locator('#lg-y2022-host').evaluate("""el=>{
      const cards=document.querySelector('#lg-debrief .lg-debriefcards');
      return !!cards && (cards.nextElementSibling===el || cards.nextElementSibling?.contains(el));
    }"""), label + ' 2022 링크는 디브리핑 질문 바로 뒤 [15]')
    open_panel(team, 'rank')
    masked = team.locator('#lg-rank [data-team]').filter(has_text='이름 가림')
    require(checks, masked.count() > 0, label + ' 이름 가린 순위 실제 사례 [15]')
    scores = host.evaluate(PUBLIC)['econ']['score']['by']
    for i in range(masked.count()):
        row = masked.nth(i)
        match = re.search(r'(\d+)위\s*([\d,.]+)점\s*\(이름 가림\)', row.inner_text())
        require(checks, bool(match), label + ' 이름 가린 순위에 점수 [15]')
        actual = scores[row.get_attribute('data-team')]
        checks.ok(int(match[1]) == actual['rank'] and abs(float(match[2].replace(',', '')) - actual['score']) <= .051,
                  label + ' 가린 점수=공개 점수(소수1자리) [15]')
    checks.ok(team.locator('#lg-rank').evaluate("""el=>![...el.querySelectorAll('h3,h4')].some(h=>
      /CBAM/.test(h.textContent) && !h.parentElement.textContent.replace(h.textContent,'').trim())"""),
              label + ' 내용 없는 CBAM 제목 없음 [15]')
    checks.ok(not private_keys(host.evaluate(PUBLIC)) and REASON not in host.locator('body').evaluate('el=>el.outerHTML'),
              label + ' 끝에서도 사적 이유·판정 비전송 [D-65]')
    capture(checks, team, label + '-순위')
    capture(checks, host, label + '-진행자끝')


def main():
    checks = Checks()
    base = local_address(sys.argv)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height, scheme in ((1280, 900, 'light'), (1180, 820, 'light'), (390, 844, 'dark')):
            for mode, scenario in (('solo', solo), ('multi', multiplayer)):
                label = f'{width}x{height}-{scheme}-{mode}'
                context, external = context_for(browser, base, width, height, scheme)
                pages = []
                try:
                    scenario(checks, context, base, width, label, pages)
                except Exception as exc:
                    checks.ok(False, f'{label} {type(exc).__name__}: {str(exc).splitlines()[0][:240]}')
                    for page, _, role in pages:
                        screenshot(checks, page, f's8n-{label}-{role}-failure.png')
                finally:
                    for page, events, role in pages:
                        diagnostics(checks, events, label + '-' + role)
                        overflow(checks, page, label + '-' + role)
                    checks.ok(not external, label + ' 외부 연결 시도 0')
                    context.close()
        browser.close()
    return checks.finish()


if __name__ == '__main__':
    sys.exit(main())
