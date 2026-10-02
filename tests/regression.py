"""켄텍 창의성 면접 연습실 — Playwright 검증 스크립트.

다섯 게임을 준비실 → 면접실 → 성찰 순서로 조작하면서
  - 콘솔 오류 / 페이지 오류 / 실패한 요청
  - 가로 스크롤(문서 scrollWidth > clientWidth) 발생 지점
  - 기능 단언(assert) 결과
를 뷰포트·색상 모드 조합마다 기록한다.

사용: .venv/bin/python baseline.py [--shots]
"""
import json
import os
import sys
import time
import traceback

from playwright.sync_api import sync_playwright

BASE = os.environ.get("KCP_BASE", "http://127.0.0.1:8765/index.html")
HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "shots")
WANT_SHOTS = "--shots" in sys.argv

CONFIGS = [
    ("desktop-light", 1280, 900, "light", False),
    ("desktop-dark", 1280, 900, "dark", False),
    ("mobile-light", 390, 844, "light", True),
    ("mobile-dark", 390, 844, "dark", True),
]

OVERFLOW_JS = """() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const sw = Math.max(de.scrollWidth, document.body.scrollWidth);
  const offenders = [];
  if (sw > vw) {
    const inScroller = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
        const cls = (el.className && el.className.baseVal !== undefined) ? el.className.baseVal : (el.className || '');
        offenders.push({tag: el.tagName.toLowerCase(), id: el.id || '', cls: String(cls).slice(0, 60),
                        left: Math.round(r.left), right: Math.round(r.right)});
        if (offenders.length >= 8) break;
      }
    }
  }
  return {vw, sw, offenders};
}"""


class Rec:
    def __init__(self, name):
        self.name = name
        self.console = []
        self.pageerrors = []
        self.failed = []
        self.overflow = []
        self.asserts = []
        self.exceptions = []

    def check(self, page, label, shot=False):
        r = page.evaluate(OVERFLOW_JS)
        if r["sw"] > r["vw"]:
            self.overflow.append({"where": label, **r})
        if shot and WANT_SHOTS:
            os.makedirs(SHOTS, exist_ok=True)
            page.screenshot(path=os.path.join(SHOTS, f"{self.name}--{label.replace('/', '_')}.png"), full_page=True)

    def expect(self, cond, msg):
        self.asserts.append({"ok": bool(cond), "msg": msg})
        return bool(cond)


def go(page, hash_, wait_sel):
    page.evaluate(f"location.hash = '{hash_}'")
    page.wait_for_selector(wait_sel, timeout=10000)
    page.wait_for_timeout(100)


def to_room(page, rec, btn, label, min_q):
    page.click(btn)
    page.wait_for_selector(".qdeck .qcard", timeout=10000)
    n = page.locator(".qdeck .qcard").count()
    rec.expect(n >= min_q, f"{label} 면접실 질문 {n}개 (>= {min_q})")
    page.fill('textarea[data-a="0"]', "결론 먼저, 근거 둘.")
    rec.check(page, f"{label}/room", shot=True)
    page.click("#toReflect")
    page.wait_for_selector("table.rubric", timeout=10000)
    page.locator('.seg button[data-v="3"]').first.click()
    page.locator('.seg button[data-v="2"]').nth(1).click()
    rsum = page.inner_text("#rsum")
    rec.expect(rsum.startswith("점검 2/9"), f"{label} 자기 평가 합계 표시 '{rsum}'")
    page.fill(f'textarea[id^="nextstep-"]', "결론을 먼저 말한다")
    page.click("#copyAll")
    page.wait_for_timeout(300)
    page.click("#resetAll")
    rec.expect(page.locator("#confirmReset").is_visible(), f"{label} 기록 지우기 확인창 표시")
    page.click("#noReset")
    rec.expect(page.locator("#confirmReset").is_hidden(), f"{label} 기록 지우기 취소")
    rec.check(page, f"{label}/reflect", shot=True)


def timer_test(page, rec):
    before = page.inner_text("#clock")
    page.click("#tgo")
    page.wait_for_timeout(1600)
    running = page.inner_text("#clock")
    rec.expect(running != before, f"타이머 시작 후 시계 변화 {before} → {running}")
    page.click("#tgo")
    page.wait_for_timeout(1200)
    paused = page.inner_text("#clock")
    rec.expect(paused == running, f"타이머 일시정지 유지 {running} == {paused}")
    page.click("#treset")
    rec.expect(page.inner_text("#clock") == before, "타이머 초기화")


def game2022(page, rec):
    go(page, "#y2022", "#grid .cell")
    rec.check(page, "2022/prep", shot=True)
    timer_test(page, rec)
    for ov in ["wind", "current", "solar", "map"]:
        page.click(f'[data-ov="{ov}"]')
        rec.check(page, f"2022/overlay-{ov}")
    for tool, cell in [("fossil", "F5"), ("nuclear", "I9"), ("solar", "I7"), ("wind", "B1")]:
        page.click(f'[data-tool="{tool}"]')
        page.click(f'[data-cell="{cell}"]')
    rec.expect(page.locator("#grid .plant").count() == 4, "2022 1번: 발전소 4기 배치")
    page.fill("#r1-solar", "일사량 20, 새 서식지 회피")
    page.click('[data-mode="q2"]')
    page.click('[data-tool="wind"]')
    for cell in ["A6", "A7", "B6"]:
        page.click(f'[data-cell="{cell}"]')
    sup = page.locator("table.supply").first.inner_text()
    rec.expect("충족" in sup, "2022 2번: 배멧 60 충족 표시")
    page.select_option("#to-0", "참살이")
    page.click('[data-del="2"]')
    rec.expect(page.locator("table.supply").nth(1).locator("tbody tr").count() == 2, "2022 2번: 발전소 삭제 후 2기")
    page.fill("#q2t", "풍력 위주, 바다 외곽.")
    rec.expect(page.locator("#warn li").count() >= 1, "2022 영향 분석 항목 표시")
    rec.check(page, "2022/prep-q2", shot=True)
    to_room(page, rec, "#go22", "2022", 7)


def game2023(page, rec):
    go(page, "#y2023", "[data-node]")
    rec.check(page, "2023/prep", shot=True)
    for nid in ["1C", "2G", "1A", "2C", "2B", "3C", "3B", "2H", "3H", "4G"]:
        page.click(f'[data-node="{nid}"]')
    rec.expect(page.inner_text("#yr").strip() == "10 / 10년", f"2023 10년 계획 완성 '{page.inner_text('#yr').strip()}'")
    page.click("#undo")
    rec.expect(page.inner_text("#yr").strip() == "9 / 10년", "2023 마지막 해 취소")
    page.click('[data-node="4G"]')
    page.click('[data-tab="wheel"]')
    rec.check(page, "2023/tab-wheel")
    page.click('[data-tab="nb"]')
    rec.check(page, "2023/tab-nb", shot=True)
    page.click('[data-tab="path"]')
    page.fill("#q1-23", "나람국 과학 집중, 다람국 환경 집중.")
    page.fill("#q2-23", "환경 우선, 박람회 조건 충족.")
    rec.check(page, "2023/prep-done")
    to_room(page, rec, "#go23", "2023", 9)


def game2024(page, rec):
    go(page, "#y2024", "[data-hex]")
    rec.check(page, "2024/prep", shot=True)
    hexes = page.locator("[data-hex]")
    n = hexes.count()
    for i in range(min(n, 16)):
        hexes.nth(i).click()
        page.wait_for_timeout(60)
        if page.inner_text("#tcount").startswith("4 /"):
            break
    rec.expect(page.inner_text("#tcount").startswith("4 /"), f"2024 정착지 4칸 선택 '{page.inner_text('#tcount')}'")
    for _ in range(3):
        page.locator("[data-inc]").first.click()
    page.locator("[data-toggle]").nth(0).click()
    page.locator("[data-toggle]").nth(1).click()
    rec.expect(page.inner_text("#icount").startswith("5 /"), f"2024 아이템 5개 '{page.inner_text('#icount')}'")
    page.check("#showK")
    rec.expect(page.locator(".hexmap text").count() > 0, "2024 채굴량 표시 토글")
    page.click("#sim")
    rec.expect(page.locator("#gauges .gauge").count() == 6, "2024 시뮬레이션 후 속성 6개 표시")
    rec.expect(page.locator("#go24").is_disabled(), "2024 확정 전 면접실 버튼 비활성")
    page.click("#lock")
    page.wait_for_selector("#unlock", timeout=5000)
    rec.expect(page.locator("#go24").is_enabled(), "2024 확정 후 면접실 버튼 활성")
    page.click('[data-match="no"]')
    page.fill("#plan24", "숲과 호수 중심, 엔지니어 3명.")
    rec.check(page, "2024/prep-locked", shot=True)
    to_room(page, rec, "#go24", "2024", 7)
    go(page, "#y2024", "#phase")
    page.click('[data-phase="prep"]')
    page.wait_for_selector("#unlock", timeout=5000)
    page.click("#unlock")
    page.wait_for_selector("#lock", timeout=5000)
    rec.expect(page.locator("#lock").count() == 1, "2024 다시 계획하기 → 확정 버튼 복귀")


def game2025(page, rec):
    go(page, "#y2025", "[data-tab]")
    rec.check(page, "2025/prep", shot=True)
    for pid in ["red", "green", "black", "blue"]:
        page.click(f'[data-tab="{pid}"]')
        rec.check(page, f"2025/paper-{pid}")
    page.locator("[data-fact]").first.click()
    rec.expect(page.input_value("#overall25").startswith("["), "2025 단서 카드 → 종합 설명에 삽입")
    for pid, slot in [("red", 0), ("blue", 1), ("green", 2), ("black", 3)]:
        page.click(f'[data-sel="{pid}"]')
        page.click(f'[data-slot="{slot}"]')
    rec.expect("모두 배치" in page.inner_text("#tray"), "2025 신문 4부 배치 완료")
    page.click('[data-down="0"]')
    rec.expect("●" in page.locator('[data-slot="0"]').inner_text(), "2025 아래로 이동")
    page.click('[data-up="1"]')
    rec.expect("■" in page.locator('[data-slot="0"]').inner_text(), "2025 위로 이동")
    page.fill("#lk-0", "창간호의 매장량 우려가 고갈 기사로 이어짐")
    page.fill("#gp-0", "에너지청 공모")
    page.focus("#lk-1")
    page.locator("[data-fact]").nth(1).click()
    rec.expect("[" in page.input_value("#lk-1"), "2025 단서 카드 → 포커스된 연결 근거 칸에 삽입")
    rec.check(page, "2025/prep-done", shot=True)
    to_room(page, rec, "#go25", "2025", 8)


def game2026(page, rec):
    go(page, "#y2026", "#score select")
    rec.check(page, "2026/prep", shot=True)
    for t in ["bb", "db", "ml", "wc", "crit"]:
        page.click(f'[data-tab="{t}"]')
        rec.check(page, f"2026/tab-{t}")
    for t, v in [("bb", "4"), ("db", "3"), ("ml", "2"), ("wc", "5")]:
        for k in "fsegu":
            page.select_option(f"#sc-{t}-{k}", v)
    rec.expect(page.locator("tr.best td.name").inner_text() == "울버린 켄텍카솔", "2026 합계 최고 행 강조")
    rec.expect(page.locator('[data-tot="wc"]').inner_text() == "합계 25점", "2026 추천 버튼 합계 표시")
    page.click('[data-pick="ml"]')
    page.fill("#reason26", "사회/윤리 기준을 가장 무겁게 봄.")
    page.fill("#note-bb", "그래프와 문구 불일치")
    rec.check(page, "2026/prep-done", shot=True)
    page.click("#go26")
    page.wait_for_selector(".qdeck .qcard", timeout=10000)
    deck = page.inner_text(".qdeck")
    rec.expect("합계로는" in deck, "2026 합계와 다른 추천 → 후속 질문 생성")
    page.click('[data-phase="prep"]')
    page.wait_for_selector("#go26", timeout=5000)
    to_room(page, rec, "#go26", "2026", 7)
    rec.expect(page.locator("details.reveal").count() >= 8, "2026 성찰: 예시 답안·단서 details")


def home_after(page, rec):
    go(page, "#home", ".pkg")
    rec.expect(page.locator(".pkg").count() == 5, "홈: 게임 카드 5개")
    rec.expect(page.locator(".pkg .chip.accent").count() == 5, "홈: 다섯 해 모두 '이어서 하기' 표시")
    rec.check(page, "home-after", shot=True)
    page.reload()
    page.wait_for_selector(".pkg", timeout=10000)
    go(page, "#y2026", "#phase")
    page.click('[data-phase="prep"]')
    page.wait_for_selector("#reason26", timeout=5000)
    rec.expect(page.input_value("#reason26").startswith("사회/윤리"), "새로고침 후 localStorage 복원")


def run_config(pw, cfg):
    name, w, h, scheme, mobile = cfg
    rec = Rec(name)
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, is_mobile=mobile, has_touch=mobile, locale="ko-KR")
    page = ctx.new_page()
    page.on("console", lambda m: rec.console.append({"type": m.type, "text": m.text, "url": (m.location or {}).get("url", "")}) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: rec.pageerrors.append(str(e)))
    page.on("requestfailed", lambda r: rec.failed.append({"url": r.url, "err": r.failure}))
    page.goto(BASE)
    page.wait_for_selector(".pkg", timeout=15000)
    rec.expect(page.locator(".pkg").count() == 5, "홈: 게임 카드 5개")
    rec.check(page, "home", shot=True)
    for fn in (game2022, game2023, game2024, game2025, game2026, home_after):
        try:
            fn(page, rec)
        except Exception as e:  # noqa: BLE001
            rec.exceptions.append({"step": fn.__name__, "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()[-1500:]})
    ctx.close()
    browser.close()
    return rec


def main():
    t0 = time.time()
    out = {}
    with sync_playwright() as pw:
        for cfg in CONFIGS:
            rec = run_config(pw, cfg)
            out[rec.name] = {
                "console": rec.console, "pageerrors": rec.pageerrors, "failed_requests": rec.failed,
                "overflow": rec.overflow, "asserts": rec.asserts, "exceptions": rec.exceptions,
            }
    with open(os.environ.get("KCP_RESULT", os.path.join(HERE, "results", "regression.json")), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    bad = 0
    print(f"{'config':14} {'asserts':>9} {'console':>8} {'pageerr':>8} {'reqfail':>8} {'overflow':>9} {'except':>7}")
    for name, r in out.items():
        ok = sum(1 for a in r["asserts"] if a["ok"])
        tot = len(r["asserts"])
        ext = [c for c in r["console"] if "fonts.g" in c["text"] or "fonts.g" in c.get("url", "")]
        cons = [c for c in r["console"] if c not in ext]
        row_bad = (tot - ok) + len(cons) + len(r["pageerrors"]) + len(r["overflow"]) + len(r["exceptions"])
        bad += row_bad
        print(f"{name:14} {ok:>4}/{tot:<4} {len(cons):>8} {len(r['pageerrors']):>8} {len(r['failed_requests']):>8} {len(r['overflow']):>9} {len(r['exceptions']):>7}")
        for a in r["asserts"]:
            if not a["ok"]:
                print(f"   FAIL  {a['msg']}")
        for c in cons:
            print(f"   CONSOLE[{c['type']}] {c['text'][:200]} ({c.get('url','')[:80]})")
        for e in r["pageerrors"]:
            print(f"   PAGEERROR {e[:200]}")
        for fr in r["failed_requests"]:
            print(f"   REQFAIL {fr['url'][:100]} {fr['err']}")
        for o in r["overflow"]:
            print(f"   OVERFLOW {o['where']}: scrollWidth {o['sw']} > viewport {o['vw']}")
            for el in o["offenders"]:
                print(f"       <{el['tag']} id='{el['id']}' class='{el['cls']}'> left={el['left']} right={el['right']}")
        for ex in r["exceptions"]:
            print(f"   EXCEPTION in {ex['step']}: {ex['error'][:300]}")
    print(f"\n{time.time() - t0:.1f}s, problems: {bad}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
