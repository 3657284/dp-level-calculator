const GRAVITY = 9.80665;

const LABELS = {
    processDensity: '介质密度',
    minLevel: '最小液位高度',
    levelSpan: '液位测量跨度',
    tapGap: '高低取压口高差',
    hpColumn: '高压侧液柱高度',
    fillDensity: '毛细管填充液密度',
    isolDensity: '高压侧隔离液密度',
    condensateDensity: '负压侧冷凝液密度',
    operatingPressure: '设备操作压力',
    staticMin: '膜片允许静压下限',
    staticMax: '膜片允许静压上限',
};

const MODE_LABELS = {
    flange: '隔膜双法兰',
    impulse: '引压管',
    'single-flange': '隔膜单法兰',
};

function numberValue(value) {
    if (value === null || value === undefined || String(value).trim() === '') {
        return NaN;
    }
    return Number(value);
}

function fixed(value, digits) {
    return Number(value).toFixed(digits === undefined ? 3 : digits);
}

function addError(errors, errorList, field, message) {
    if (!errors[field]) {
        errors[field] = message;
        errorList.push(message);
    }
}

function validateNumber(form, field, errors, errorList, min, max, allowZero) {
    const value = numberValue(form[field]);
    if (!Number.isFinite(value)) {
        addError(errors, errorList, field, '请输入' + LABELS[field]);
        return value;
    }
    if ((allowZero ? value < min : value <= min) || value > max) {
        const lower = allowZero ? min + '（含）' : min + '（不含）';
        addError(errors, errorList, field, LABELS[field] + '应在 ' + lower + ' 至 ' + max + ' 之间');
    }
    return value;
}

function calculateLevel(form, mode, condensateEnabled) {
    const errors = {};
    const errorList = [];
    const warnings = [];
    const isFlange = mode === 'flange';
    const isSingleFlange = mode === 'single-flange';
    const isImpulse = mode === 'impulse';
    const hasStaticCheck = isFlange || isSingleFlange;

    const processDensity = validateNumber(form, 'processDensity', errors, errorList, 0, 3000, false);
    const minLevel = validateNumber(form, 'minLevel', errors, errorList, 0, 100, true);
    const levelSpan = validateNumber(form, 'levelSpan', errors, errorList, 0, 100, false);
    const tapGap = isSingleFlange
        ? 0
        : validateNumber(form, 'tapGap', errors, errorList, 0, 100, false);
    const hpColumn = validateNumber(form, 'hpColumn', errors, errorList, -100, 100, true);
    const fillOrIsolDensity = validateNumber(
        form,
        isFlange || isSingleFlange ? 'fillDensity' : 'isolDensity',
        errors,
        errorList,
        0,
        3000,
        false
    );
    const condensateDensity = isImpulse && condensateEnabled
        ? validateNumber(form, 'condensateDensity', errors, errorList, 0, 3000, false)
        : 0;
    const operatingPressure = hasStaticCheck
        ? validateNumber(form, 'operatingPressure', errors, errorList, -1000, 100000, true)
        : 0;
    const staticMin = hasStaticCheck
        ? validateNumber(form, 'staticMin', errors, errorList, -1000, 100000, true)
        : 0;
    const staticMax = hasStaticCheck
        ? validateNumber(form, 'staticMax', errors, errorList, -1000, 100000, true)
        : 0;

    if (hasStaticCheck && Number.isFinite(staticMin) && Number.isFinite(staticMax) && staticMax <= staticMin) {
        addError(errors, errorList, 'staticMax', '膜片允许静压上限必须大于下限');
    }

    if (errorList.length > 0) {
        return { errors: errors, errorList: errorList, warnings: warnings, result: null };
    }

    // 低压侧等效液柱高度：
    // 单法兰：低压侧直接连通气相/大气，无液柱 → hL = 0
    // 双法兰：低压侧毛细管液柱 hL = hH + Δh
    // 引压管：湿式 hL = hH + Δh；干式 hL = 0
    const lpColumn = isSingleFlange
        ? 0
        : (isFlange || condensateEnabled) ? hpColumn + tapGap : 0;

    // 单法兰：膜片与变送器同高安装、无长毛细管，hH 恒为 0
    const effectiveHpColumn = isSingleFlange ? 0 : hpColumn;

    const processSpan = processDensity * GRAVITY * levelSpan / 1000;
    const processZero = processDensity * GRAVITY * minLevel / 1000;
    const hpLegPressure = fillOrIsolDensity * GRAVITY * effectiveHpColumn / 1000;
    const lpLegPressure = isFlange
        ? fillOrIsolDensity * GRAVITY * lpColumn / 1000
        : condensateDensity * GRAVITY * lpColumn / 1000;
    const migration = processZero + hpLegPressure - lpLegPressure;
    const lrv = migration;
    const urv = migration + processSpan;
    const migrationType = Math.abs(migration) < 0.0000001
        ? '无迁移'
        : migration > 0 ? '正迁移' : '负迁移';

    let staticCheck = null;
    if (hasStaticCheck) {
        // 膜片静压 = 设备操作压力 + 容器内介质在取压口处的液柱静压（不含毛细管/隔离液柱）
        const hpStatic = operatingPressure + processDensity * GRAVITY * (minLevel + levelSpan) / 1000;
        const lpStatic = operatingPressure;
        const hpPass = hpStatic >= staticMin && hpStatic <= staticMax;
        const lpPass = lpStatic >= staticMin && lpStatic <= staticMax;
        staticCheck = {
            hpStatic: hpStatic,
            lpStatic: lpStatic,
            hpStaticText: fixed(hpStatic),
            lpStaticText: fixed(lpStatic),
            hpPass: hpPass,
            lpPass: lpPass,
            hpStatus: hpPass ? '在允许范围内' : '超出允许范围',
            lpStatus: lpPass ? '在允许范围内' : '超出允许范围',
            pass: hpPass && lpPass,
            status: hpPass && lpPass ? '静压核验通过' : '静压核验未通过',
            rangeText: fixed(staticMin) + ' ～ ' + fixed(staticMax) + ' kPa(g)',
            note: '静压为设备介质在取压口处的表压，不含毛细管/隔离液柱压力。',
        };
        if (!staticCheck.pass) {
            warnings.push('膜片静压超出允许范围，请调整取压/安装方案或重新选型。');
        }
    }

    // 液位跨度超过取压口高差的预警（不再报错，量程仍按液位跨度计算）
    if (!isSingleFlange && Number.isFinite(levelSpan) && Number.isFinite(tapGap)) {
        if (levelSpan > tapGap) {
            warnings.push('液位跨度 H 大于高低取压口高差 Δh，满量程差压仍按液位跨度 H 计算，请确认最大液位未超出低压取压口、负压侧无介质倒灌。');
        } else if (minLevel + levelSpan > tapGap) {
            warnings.push('最大液位 h₀ + H 超过低压取压口高度 Δh，请确认高液位时负压侧不会进液。');
        }
    }

    if ((!isSingleFlange && hpColumn < 0) || lpColumn < 0) {
        warnings.push('存在负液柱高度，表示变送器高于相应取压口；公式已按有符号高度计算，请核对安装方向。');
    }
    if (Math.abs(migration) > processSpan * 2) {
        warnings.push('迁移量绝对值超过差压量程的 2 倍，请重点核查液柱高度、密度与取压口高差。');
    }
    if (urv < lrv) {
        warnings.push('校验失败：量程上限小于下限。');
    }

    const lpDensity = isFlange ? fillOrIsolDensity : condensateDensity;
    const lpDescription = isSingleFlange
        ? '气相/大气（液柱压力取 0）'
        : isFlange
            ? '毛细管填充液'
            : condensateEnabled ? '负压侧冷凝液' : '干式引压管（液柱压力取 0）';

    const steps = [
        {
            title: '1. 确定两侧等效液柱',
            formula: isSingleFlange
                ? '单法兰低压侧直通气相：hL = 0，hH = 0'
                : (!isFlange && !condensateEnabled) ? '干式负压侧：hL = 0' : 'hL = hH + Δh',
            value: 'hH = ' + fixed(effectiveHpColumn) + ' m；hL = ' + fixed(lpColumn) + ' m',
        },
        {
            title: '2. 计算差压量程',
            formula: 'ΔPspan = ρ介质 × g × H / 1000',
            value: fixed(processDensity, 1) + ' × 9.80665 × ' + fixed(levelSpan) + ' / 1000 = ' + fixed(processSpan) + ' kPa',
        },
        {
            title: '3. 计算最小液位时差压（迁移量）',
            formula: 'ΔP₀ = ρ介质·g·h₀/1000 + ρH·g·hH/1000 − ρL·g·hL/1000',
            value: fixed(processZero) + ' + ' + fixed(hpLegPressure) + ' − ' + fixed(lpLegPressure) + ' = ' + fixed(migration) + ' kPa',
        },
        {
            title: '4. 确定调校范围',
            formula: 'LRV = ΔP₀；URV = ΔP₀ + ΔPspan',
            value: 'LRV = ' + fixed(lrv) + ' kPa；URV = ' + fixed(urv) + ' kPa',
        },
    ];

    if (staticCheck) {
        steps.push({
            title: '5. 核验最大液位时膜片静压',
            formula: 'PH = P操作 + ρ介质·g·(h₀+H)/1000；PL = P操作',
            value: '高压侧 ' + staticCheck.hpStaticText + ' kPa(g)，低压侧 ' + staticCheck.lpStaticText + ' kPa(g)',
        });
    }

    const inputs = [
        { label: '计算类型', value: MODE_LABELS[mode] },
        { label: '介质密度 ρ介质', value: fixed(processDensity, 1) + ' kg/m³' },
        { label: '最小液位 h₀', value: fixed(minLevel) + ' m（' + (isSingleFlange ? '相对膜片安装点' : '相对高压取压口') + '）' },
        { label: '液位跨度 H', value: fixed(levelSpan) + ' m' },
        { label: '高压侧液柱 hH', value: fixed(effectiveHpColumn) + ' m（' + (isSingleFlange ? '膜片与变送器同高' : '变送器低于取压口为正') + '）' },
        { label: (isFlange || isSingleFlange) ? '填充液密度 ρH' : '隔离液密度 ρH', value: fixed(fillOrIsolDensity, 1) + ' kg/m³' },
    ];
    if (!isSingleFlange) {
        inputs.splice(4, 0, { label: '取压口高差 Δh', value: fixed(tapGap) + ' m（低压口高于高压口）' });
        inputs.push({ label: '低压侧介质', value: lpDescription + (isFlange || condensateEnabled ? '，' + fixed(lpDensity, 1) + ' kg/m³' : '') });
    } else {
        inputs.push({ label: '低压侧介质', value: lpDescription });
    }
    if (staticCheck) {
        inputs.push({ label: '设备操作压力', value: fixed(operatingPressure) + ' kPa(g)' });
        inputs.push({ label: '膜片允许静压', value: staticCheck.rangeText });
    }

    return {
        errors: errors,
        errorList: errorList,
        warnings: warnings,
        result: {
            mode: mode,
            processSpan: processSpan,
            migration: migration,
            lrv: lrv,
            urv: urv,
            hpColumn: effectiveHpColumn,
            lpColumn: lpColumn,
            processSpanText: fixed(processSpan),
            migrationText: fixed(migration),
            lrvText: fixed(lrv),
            urvText: fixed(urv),
            rangeText: fixed(lrv) + ' ～ ' + fixed(urv) + ' kPa',
            migrationType: migrationType,
            steps: steps,
            inputs: inputs,
            staticCheck: staticCheck,
        },
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GRAVITY, MODE_LABELS, calculateLevel };
} else {
    window.LevelCalculator = { GRAVITY, MODE_LABELS, calculateLevel };
}
