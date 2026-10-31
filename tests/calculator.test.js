const assert = require('assert');
const { calculateLevel, GRAVITY } = require('../miniprogram/utils/level-calculator');

const flangeForm = {
    processDensity: '1000',
    minLevel: '0',
    levelSpan: '2',
    tapGap: '2.5',
    hpColumn: '1',
    fillDensity: '950',
    isolDensity: '1000',
    condensateDensity: '998',
    operatingPressure: '200',
    staticMin: '-100',
    staticMax: '1000',
};

const impulseForm = Object.assign({}, flangeForm, {
    processDensity: '800',
    minLevel: '0.2',
    levelSpan: '1.8',
    tapGap: '2',
    hpColumn: '0.8',
});

function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, (message || '数值不一致') + ': ' + actual + ' != ' + expected);
}

const flange = calculateLevel(flangeForm, 'flange', true);
assert.strictEqual(flange.errorList.length, 0);
close(flange.result.processSpan, 1000 * GRAVITY * 2 / 1000, '双法兰量程');
close(flange.result.migration, -950 * GRAVITY * 2.5 / 1000, '双法兰负迁移');
close(flange.result.lrv, flange.result.migration, 'LRV 等于迁移量');
close(flange.result.urv, flange.result.lrv + flange.result.processSpan, 'URV 等于 LRV 加量程');
assert.strictEqual(flange.result.migrationType, '负迁移');
assert.strictEqual(flange.result.staticCheck.pass, true);
close(flange.result.staticCheck.hpStatic, 200 + 1000 * GRAVITY * 2 / 1000, '高压侧静压');
close(flange.result.staticCheck.lpStatic, 200, '低压侧静压');

const impulseWet = calculateLevel(impulseForm, 'impulse', true);
assert.strictEqual(impulseWet.errorList.length, 0);
const expectedWetZero = 800 * GRAVITY * 0.2 / 1000
    + 1000 * GRAVITY * 0.8 / 1000
    - 998 * GRAVITY * 2.8 / 1000;
close(impulseWet.result.migration, expectedWetZero, '湿式引压管迁移量');
assert.strictEqual(impulseWet.result.staticCheck, null);

const impulseDry = calculateLevel(impulseForm, 'impulse', false);
const expectedDryZero = 800 * GRAVITY * 0.2 / 1000 + 1000 * GRAVITY * 0.8 / 1000;
close(impulseDry.result.migration, expectedDryZero, '干式引压管忽略负压侧液柱');
assert.strictEqual(impulseDry.result.migrationType, '正迁移');

const staticFail = calculateLevel(Object.assign({}, flangeForm, { operatingPressure: '1200' }), 'flange', true);
assert.strictEqual(staticFail.result.staticCheck.pass, false);
assert.strictEqual(staticFail.result.staticCheck.hpPass, false);
assert(staticFail.warnings.some(item => item.indexOf('静压超出') >= 0));

const missing = calculateLevel(Object.assign({}, flangeForm, { processDensity: '' }), 'flange', true);
assert.strictEqual(missing.result, null);
assert(missing.errors.processDensity);
assert.strictEqual(missing.errorList.length, 1);

const invalidRange = calculateLevel(Object.assign({}, flangeForm, { levelSpan: '-1' }), 'flange', true);
assert.strictEqual(invalidRange.result, null);
assert(invalidRange.errors.levelSpan);

const spanExceedsTapGap = calculateLevel(Object.assign({}, flangeForm, { levelSpan: '3' }), 'flange', true);
assert.strictEqual(spanExceedsTapGap.errorList.length, 0, '跨度超过高差不应报错');
assert(spanExceedsTapGap.result !== null, '跨度超过高差应正常出结果');
close(spanExceedsTapGap.result.processSpan, 1000 * GRAVITY * 3 / 1000, '跨度超过高差时量程仍按跨度计算');
assert(spanExceedsTapGap.warnings.some(item => item.indexOf('液位跨度 H 大于') >= 0), '跨度超过高差应给出预警');

const maxLevelExceedsTap = calculateLevel(Object.assign({}, flangeForm, { minLevel: '1', levelSpan: '2' }), 'flange', true);
assert.strictEqual(maxLevelExceedsTap.errorList.length, 0, '最大液位超过低压口不应报错');
assert(maxLevelExceedsTap.result !== null, '最大液位超过低压口应正常出结果');
assert(maxLevelExceedsTap.warnings.some(item => item.indexOf('最大液位') >= 0), '最大液位超过低压口应给出预警');

const invalidStatic = calculateLevel(Object.assign({}, flangeForm, { staticMin: '1000', staticMax: '100' }), 'flange', true);
assert.strictEqual(invalidStatic.result, null);
assert(invalidStatic.errors.staticMax);

const signedColumn = calculateLevel(Object.assign({}, flangeForm, { hpColumn: '-1' }), 'flange', true);
assert.strictEqual(signedColumn.errorList.length, 0);
close(signedColumn.result.lpColumn, 1.5, '双法兰负高压液柱时的低压侧高度');
close(signedColumn.result.migration, -950 * GRAVITY * 2.5 / 1000, '双法兰负高压液柱迁移量');
close(signedColumn.result.urv, signedColumn.result.lrv + signedColumn.result.processSpan, '双法兰负高压液柱 URV');
assert(signedColumn.warnings.some(item => item.indexOf('负液柱高度') >= 0));

const negativeWet = calculateLevel(Object.assign({}, impulseForm, { hpColumn: '-0.8' }), 'impulse', true);
close(negativeWet.result.lpColumn, 1.2, '湿式引压管负高压液柱时的低压侧高度');
close(
    negativeWet.result.migration,
    800 * GRAVITY * 0.2 / 1000 - 1000 * GRAVITY * 0.8 / 1000 - 998 * GRAVITY * 1.2 / 1000,
    '湿式引压管负高压液柱迁移量'
);
assert.strictEqual(negativeWet.result.migrationType, '负迁移');

const negativeDry = calculateLevel(Object.assign({}, impulseForm, { hpColumn: '-0.8' }), 'impulse', false);
close(negativeDry.result.lpColumn, 0, '干式引压管低压侧液柱始终为零');
close(
    negativeDry.result.migration,
    800 * GRAVITY * 0.2 / 1000 - 1000 * GRAVITY * 0.8 / 1000,
    '干式引压管负高压液柱迁移量'
);
assert(negativeDry.result.steps[0].formula.indexOf('hL = 0') >= 0);

// 单法兰液位计（膜片与变送器同高，hH 恒为 0）
const singleForm = {
    processDensity: '1000',
    minLevel: '0',
    levelSpan: '2',
    tapGap: '0',
    hpColumn: '0.5',
    fillDensity: '950',
    isolDensity: '1000',
    condensateDensity: '998',
    operatingPressure: '200',
    staticMin: '-100',
    staticMax: '1000',
};
const singleFlange = calculateLevel(singleForm, 'single-flange', true);
assert.strictEqual(singleFlange.errorList.length, 0, '单法兰参数应通过校验');
close(singleFlange.result.lpColumn, 0, '单法兰低压侧液柱应为 0');
close(singleFlange.result.hpColumn, 0, '单法兰高压侧液柱应恒为 0（忽略输入 hH）');
close(singleFlange.result.processSpan, 1000 * GRAVITY * 2 / 1000, '单法兰量程');
close(singleFlange.result.migration, 0, '单法兰 hH=0 且最小液位为 0 时迁移量应为 0');
assert.strictEqual(singleFlange.result.migrationType, '无迁移');
assert.strictEqual(singleFlange.result.staticCheck.pass, true, '单法兰应执行静压核验');
close(singleFlange.result.staticCheck.hpStatic, 200 + 1000 * GRAVITY * 2 / 1000, '单法兰高压侧静压（不含毛细管液柱）');
assert(singleFlange.result.staticCheck.note.indexOf('不含毛细管') >= 0, '静压核验应注明不含毛细管液柱');
assert(singleFlange.result.steps[0].formula.indexOf('hL = 0') >= 0, '单法兰步骤应说明低压侧无液柱');
assert(singleFlange.result.inputs.every(item => item.label !== '取压口高差 Δh'), '单法兰不应展示取压口高差');

// 单法兰带最小液位（迁移量仅含介质零点，不含毛细管液柱）
const singleMin = calculateLevel(Object.assign({}, singleForm, { minLevel: '0.5' }), 'single-flange', true);
close(
    singleMin.result.migration,
    1000 * GRAVITY * 0.5 / 1000,
    '单法兰含最小液位的迁移量仅含介质零点'
);
assert.strictEqual(singleMin.result.migrationType, '正迁移');

console.log('PASS: 17 组差压液位计算与校验测试全部通过');
console.log('双法兰示例：' + flange.result.rangeText + '，' + flange.result.migrationType + ' ' + flange.result.migrationText + ' kPa');
console.log('引压管湿式示例：' + impulseWet.result.rangeText + '，' + impulseWet.result.migrationType + ' ' + impulseWet.result.migrationText + ' kPa');
console.log('引压管干式示例：' + impulseDry.result.rangeText + '，' + impulseDry.result.migrationType + ' ' + impulseDry.result.migrationText + ' kPa');
