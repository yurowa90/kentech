'use strict';
// D-90 이전 판과 비교하는 무보수·무신규투자 fixture 전용 정규화.
// 이름만 보고 재귀 삭제하지 않는다. 승인된 진행자 결과 경로만 검사 후 제거한다.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
// sid: undefined 등의 기존 공개 키도 지문에 남겨야 하므로 JSON 복사는 쓰지 않는다.
const clone = structuredClone;
function withoutD90(view) {
  const copy = clone(view);
  const strippedRows = new WeakSet(); // publicView의 현재·결과 보고서가 같은 객체일 수 있다.
  function fiscal(report) {
    for (const [id, row] of Object.entries(report?.fiscal || {})) {
      if (strippedRows.has(row)) continue;
      assert.equal(row.exp.repair, 0, `${id}: 기존 비교 fixture의 별도 보수 세출 0`);
      delete row.exp.repair;
      strippedRows.add(row);
    }
  }
  for (const result of copy.results || []) {
    assert.ok(!result.events.some(id => ['heavy_rain', 'heatwave_peak'].includes(id)),
      '기존 수치 불변 비교는 D-90 피해 사건이 없는 fixture에만 적용');
    for (const [id, row] of Object.entries(result.team)) {
      assert.equal(row.cost.repair, 0, `${id}: 기존 비교 fixture의 월 보수비 0`);
      delete row.cost.repair;
      if (Object.hasOwn(row, 'disasterGrant')) {
        // 고정 fixture는 새 투자·대응 없음. D-89 지급은 재난당 10억, 전액 소멸.
        const coastal = ['hwaseong', 'pyeongtaek', 'dangjin', 'asan'].includes(id);
        const awarded = result.events.filter(ev => ['coldwave_heating', 'spring_dust_haze'].includes(ev) ||
          coastal && ['typhoon_coast', 'heavy_snow_solar'].includes(ev)).length * 10;
        assert.ok(awarded > 0, '지급·보수 없는 결과에 임의 교부 정산 객체 없음');
        assert.deepEqual(row.disasterGrant, { awarded, planUsed: 0, repairUsed: 0, used: 0,
          expired: awarded, netRepair: 0 }, `${id}: 승인된 교부 정산 6필드·독립 금액`);
        delete row.disasterGrant;
      }
    }
    fiscal(result.econ);
  }
  fiscal(copy.econ?.report);
  return copy;
}
function assertRequestsUnchanged(root) {
  // D-65: 진행자 공개 필드의 예외가 팀 요청 스키마 예외로 번지지 않게 한다.
  // D-90 직전의 실제 송신·수신 함수/봉투를 그대로 비교한다. Git은 읽기만 한다.
  const before = name => execFileSync('git', ['show', `186e182:ui/${name}.js`],
    { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  for (const [name, functions] of [['league-core', ['reduce']], ['league', ['send', 'sendPlan']]]) {
    const old = before(name), current = fs.readFileSync(path.join(root, 'ui', name + '.js'), 'utf8');
    for (const fn of functions) {
      const pattern = new RegExp(`^  function ${fn}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, 'm');
      const a = current.match(pattern)?.[0], b = old.match(pattern)?.[0];
      assert.ok(a && b, `${name}.${fn}: 요청 함수 비교 연결점`);
      assert.equal(a, b, `D-65 ${name}.${fn}: 팀 요청 생성·수신 형식 불변`);
    }
  }
  assert.equal(fs.readFileSync(path.join(root, 'ui/league-net.js'), 'utf8'), before('league-net'),
    'D-65 서명·봉투·요청 필드 전송 모듈 불변');
}
module.exports = { withoutD90, assertRequestsUnchanged };
