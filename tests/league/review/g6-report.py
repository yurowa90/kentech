"""G6 원시 실행 결과를 비교표·보관용 요약으로 압축한다(네트워크 없음)."""
import json
import math
import statistics
import sys
from pathlib import Path


def technology(report, month):
    rows = [dict((r["months"][month - 1]["score"] or {}), id=r["id"], strategy=r["strategy"]) for r in report["runs"]]
    ids = list(dict.fromkeys(r["id"] for r in rows))
    strategies = list(dict.fromkeys(r["strategy"] for r in rows))
    means = {s: statistics.mean(r["score"] for r in rows if r["strategy"] == s) for s in strategies}
    winners = {i: [r["strategy"] for r in rows if r["id"] == i and
                  r["score"] == max(x["score"] for x in rows if x["id"] == i)] for i in ids}
    return dict(meanScores=means, winners=winners,
                smrFirstCities=sum("smr" in w for w in winners.values()),
                researchGain=means["research"] - means["none"], rows=rows)


def main():
    root = Path(sys.argv[1])
    summaries = {}
    order = ["baseline", "a10", "b", "c", "d72", "d144", "final"]
    for directory in sorted(root.iterdir(), key=lambda p: order.index(p.name) if p.name in order else len(order)):
        if not (directory / "tech.json").exists() or not (directory / "bots36.json").exists():
            continue
        tech = json.loads((directory / "tech.json").read_text())
        bots = json.loads((directory / "bots36.json").read_text())
        if len(tech["runs"]) != 24 or any(len(r["months"]) != 36 for r in tech["runs"]):
            continue
        summaries[directory.name] = dict(
            technology={m: technology(tech, m) for m in (12, 24, 36)},
            bots=bots["horizons"], botSummary=bots["strategySummary"],
            techFailures=tech["failures"], botFailures=[s for ok, s in bots["checks"] if not ok],
            checks=dict(techPass=tech["passes"], bots=len(bots["checks"])),
            deployment={r["id"]: dict(
                adopted=next((m["month"] for m in r["months"] if "smr" in m["adopted"]), None),
                started=next((m["month"] for m in r["months"] if "smr" in m["builds"]), None))
                for r in tech["runs"] if r["strategy"] == "smr"})
    out = Path(__file__).parent
    (out / "G6-results.json").write_text(json.dumps(summaries, ensure_ascii=False, indent=2) + "\n")
    lines = ["# G6 안별 비교표", "", "기술4전략과 일반9전략은 각각 같은 씨앗·계획기로 비교한다. 서로 다른 실험군의 점수를 합쳐 순위를 만들지 않는다.", "",
             "baseline=G5, a10=(가) 하한10, b=(나) 절대/개선1:1, c=(다) 시작 최대×1.01, d72/d144=(라) 연구량72/144, final=하한30+연구량360. 가중은 모든 안에서 G5와 같다.", "",
             "| 안 | 기술 연구/연구0/SMR/수소 평균 | 연구 이득 | SMR 1위 | 일반 nothing/base/diesel/renew/ties/taxlow/taxhigh/dm/storage 평균 | nothing 점수 순위(도시 순서) |",
             "|---|---|---:|---:|---|---|"]
    ids = ["hwaseong", "pyeongtaek", "anseong", "dangjin", "asan", "cheonan"]
    for name, summary in summaries.items():
        t, b = summary["technology"][36], summary["bots"]["36"]
        nums = lambda vals: " / ".join(f"{v:.3f}" for v in vals)
        lines.append(f"| {name} | {nums(t['meanScores'].values())} | {t['researchGain']:.3f} | {t['smrFirstCities']}/6 | {nums(b['meanScores'].values())} | " +
                     "/".join(str(b["nothingScoreCityRanks"][i]) for i in ids) + " |")
    lines += ["", "도시 순서: 화성·오산 / 평택 / 안성 / 당진 / 아산 / 천안. nothing 순위는 같은 도시의 일반9전략 점수 순위(공동순위 포함).", ""]
    for name, summary in summaries.items():
        lines += [f"## {name}: 12·24·36달", "", "| 달 | 기술 도시별1위 | SMR1위 | 연구 이득 | 일반 도시별1위 | nothing 점수 순위 |", "|---|---|---:|---:|---|---|"]
        for m in (12, 24, 36):
            t, b = summary["technology"][m], summary["bots"][str(m)]
            wins = lambda h: " / ".join("+".join(h["winners"][i]) for i in ids)
            ranks = "/".join(str(b["nothingScoreCityRanks"][i]) for i in ids)
            lines += [f"| {m} | {wins(t)} | {t['smrFirstCities']}/6 | {t['researchGain']:.3f} | {wins(b)} | {ranks} |"]
        lines += ["", "| 달 | 기술 전략 평균(연구/연구0/SMR/수소) | 일반 전략 평균(위 표 순서) |", "|---|---|---|"]
        for m in (12, 24, 36):
            t, b = summary["technology"][m], summary["bots"][str(m)]
            lines += [f"| {m} | {nums(t['meanScores'].values())} | {nums(b['meanScores'].values())} |"]
        lines += ["", "기술 검사 실패: " + ("; ".join(summary["techFailures"]) or "없음"), "",
                  "일반 봇 검사 실패: " + ("; ".join(summary["botFailures"]) or "없음"), ""]
    (out / "G6-comparison.md").write_text("\n".join(lines) + "\n")
    # 선택적 민감도: SMR6도시만 새로 운영한 결과와 동일한 비SMR18궤적을 결합한다.
    # 점수식 후보는 저장한 부분점수에 적용한다. 실제 전체 재실행과 구분해 보존한다.
    if len(sys.argv) > 2:
        screens = Path(sys.argv[2])
        base = json.loads((root / "baseline" / "tech.json").read_text())
        weights = dict(pop=.10, ind=.10, fin=.125, co2=.275, appr=.15, rel=.25)
        sensitivity = {}
        configs = [(f"d{need}", 1) for need in (144, 288, 360, 396, 432)] + [("d360", f) for f in (10, 20, 25, 29, 30)] + [("baseline", 30)]
        for name, floor in configs:
            report = base if name == "baseline" else json.loads((screens / f"g6-{name}-screen.json").read_text())
            runs = [r for r in base["runs"] if r["strategy"] != "smr"] + [r for r in report["runs"] if r["strategy"] == "smr"]
            rows = []
            for r in runs:
                # JS r1 규약: 양수의 .5는 위로 반올림한다.
                score = math.floor(10 * (math.exp(sum(w * math.log(max(floor, r["parts"][k])) for k, w in weights.items())) + r["coop"]) + .5) / 10
                rows.append(dict(id=r["id"], strategy=r["strategy"], score=score))
            means = {s: statistics.mean(r["score"] for r in rows if r["strategy"] == s) for s in ("research", "none", "smr", "hydrogen")}
            winners = {i: [r["strategy"] for r in rows if r["id"] == i and r["score"] == max(t["score"] for t in rows if t["id"] == i)] for i in ids}
            sensitivity[f"{name}-floor{floor}"] = dict(meanScores=means, researchGain=means["research"] - means["none"],
                smrFirstCities=sum("smr" in x for x in winners.values()), winners=winners,
                simulationFailures=report["failures"] if name != "baseline" else [],
                started={r["id"]: next((m["month"] for m in r["months"] if "smr" in m["builds"]), None) for r in runs if r["strategy"] == "smr"})
        (out / "G6-sensitivity.json").write_text(json.dumps(sensitivity, ensure_ascii=False, indent=2) + "\n")
    print("완전 비교:", ", ".join(summaries))


if __name__ == "__main__":
    main()
