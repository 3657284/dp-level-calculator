(function () {
    const calc = window.LevelCalculator;
    const STORAGE_KEY = 'dp-level-calc-history';
    const MAX_HISTORY = 20;

    const $ = (id) => document.getElementById(id);

    const FIELDS = [
        'processDensity', 'minLevel', 'levelSpan', 'tapGap', 'hpColumn',
        'fillDensity', 'isolDensity', 'condensateDensity',
        'operatingPressure', 'staticMin', 'staticMax',
    ];

    const DEFAULT_FORMS = {
        flange: {
            processDensity: '1000', minLevel: '0.00', levelSpan: '2.00',
            tapGap: '2.50', hpColumn: '1.00', fillDensity: '950',
            isolDensity: '1000', condensateDensity: '998',
            operatingPressure: '200', staticMin: '-100', staticMax: '1000',
        },
        'single-flange': {
            processDensity: '1000', minLevel: '0.00', levelSpan: '2.00',
            tapGap: '0', hpColumn: '0.00', fillDensity: '950',
            isolDensity: '1000', condensateDensity: '998',
            operatingPressure: '200', staticMin: '-100', staticMax: '1000',
        },
        impulse: {
            processDensity: '800', minLevel: '0.20', levelSpan: '1.80',
            tapGap: '2.00', hpColumn: '0.80', fillDensity: '950',
            isolDensity: '1000', condensateDensity: '998',
            operatingPressure: '200', staticMin: '-100', staticMax: '1000',
        },
    };

    let mode = 'flange';
    let condensateEnabled = true;
    let history = loadHistory();

    function loadHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function saveHistory() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
        } catch (e) {
            /* ignore */
        }
    }

    function fillForm(form) {
        FIELDS.forEach((f) => {
            const el = $(f);
            if (el) el.value = form[f] !== undefined ? form[f] : '';
        });
    }

    function getForm() {
        const form = {};
        FIELDS.forEach((f) => {
            const el = $(f);
            form[f] = el ? el.value : '';
        });
        return form;
    }

    function dateText(d) {
        const p = (v) => (v < 10 ? '0' + v : String(v));
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function applyModeUI() {
        const isFlange = mode === 'flange';
        const isSingle = mode === 'single-flange';
        const isImpulse = mode === 'impulse';

        $('tapGapField').style.display = isSingle ? 'none' : '';
        $('hpColumnField').style.display = isSingle ? 'none' : '';
        $('hpColumnStatic').style.display = isSingle ? '' : 'none';
        $('fillDensityField').style.display = (isFlange || isSingle) ? '' : 'none';
        $('isolDensityField').style.display = isImpulse ? '' : 'none';
        $('condensateSwitchRow').style.display = isImpulse ? '' : 'none';
        $('condensateDensityField').style.display = (isImpulse && condensateEnabled) ? '' : 'none';
        $('staticSection').style.display = (isFlange || isSingle) ? '' : 'none';

        $('minLevelHelp').textContent = isSingle ? '相对膜片安装点' : '相对高压取压口';
        $('hpColumnHelp').textContent = '高压取压口高于变送器的垂直距离';
        $('fillDensityHelp').textContent = isSingle ? '单法兰 hH=0 时此值不参与迁移量计算' : '高、低压侧采用相同填充液';
    }

    function switchMode(next) {
        mode = next;
        document.querySelectorAll('.mode').forEach((el) => {
            el.classList.toggle('active', el.dataset.mode === next);
        });
        fillForm(DEFAULT_FORMS[next]);
        applyModeUI();
        clearResult();
    }

    function clearResult() {
        $('result-section').innerHTML = '';
        $('result-section').classList.add('hidden');
        $('error-banner').classList.add('hidden');
    }

    function showErrors(errorList) {
        const banner = $('error-banner');
        if (!errorList || errorList.length === 0) {
            banner.classList.add('hidden');
            return;
        }
        banner.innerHTML = '<strong>请先修正 ' + errorList.length + ' 项输入问题</strong>'
            + errorList.map((e) => '<span>• ' + escapeHtml(e) + '</span>').join('');
        banner.classList.remove('hidden');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
        }[c]));
    }

    function renderResult(calculation) {
        const r = calculation.result;
        const warnings = calculation.warnings || [];
        const sec = $('result-section');
        sec.classList.remove('hidden');

        let html = '';

        html += '<div class="result-heading">'
            + '<div><div class="kicker">CALCULATION RESULT</div><div class="title">计算结果</div></div>'
            + '<span class="badge ' + (r.migrationType === '负迁移' ? 'negative' : '') + '">' + r.migrationType + '</span>'
            + '</div>';

        html += '<div class="result-primary">'
            + '<div class="label">变送器调校范围</div>'
            + '<div class="range">' + r.rangeText + '</div>'
            + '<div class="range-labels"><span>LRV ' + r.lrvText + '</span><span>URV ' + r.urvText + '</span></div>'
            + '</div>';

        html += '<div class="metrics">'
            + '<div class="metric"><div class="m-label">差压量程</div><div class="m-value">' + r.processSpanText + ' <span>kPa</span></div></div>'
            + '<div class="metric"><div class="m-label">零点迁移量</div><div class="m-value">' + r.migrationText + ' <span>kPa</span></div></div>'
            + '</div>';

        if (warnings.length > 0) {
            html += '<div class="warnings"><div class="w-title">工程提示</div>'
                + warnings.map((w) => '<span>• ' + escapeHtml(w) + '</span>').join('')
                + '</div>';
        }

        if (r.staticCheck) {
            const sc = r.staticCheck;
            html += '<div class="static-card ' + (sc.pass ? 'pass' : 'fail') + '">'
                + '<div class="sc-head"><div>膜片静压核验</div><div class="sc-status">' + sc.status + '</div></div>'
                + '<div class="sc-range">允许范围：' + sc.rangeText + '</div>'
                + '<div class="sc-row"><span>高压侧（最大液位）</span><span>' + sc.hpStaticText + ' kPa(g) · ' + sc.hpStatus + '</span></div>'
                + '<div class="sc-row"><span>低压侧</span><span>' + sc.lpStaticText + ' kPa(g) · ' + sc.lpStatus + '</span></div>'
                + '<div class="sc-note">' + escapeHtml(sc.note) + '</div>'
                + '</div>';
        }

        html += '<div class="detail"><div class="d-title">计算步骤</div>'
            + r.steps.map((s) => '<div class="step"><div class="s-title">' + escapeHtml(s.title) + '</div>'
                + '<div class="s-formula">' + escapeHtml(s.formula) + '</div>'
                + '<div class="s-value">' + escapeHtml(s.value) + '</div></div>').join('')
            + '</div>';

        html += '<div class="detail"><div class="d-title">输入参数复核</div>'
            + r.inputs.map((i) => '<div class="summary"><span>' + escapeHtml(i.label) + '</span><span>' + escapeHtml(i.value) + '</span></div>').join('')
            + '</div>';

        sec.innerHTML = html;
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function calculate(save) {
        const calculation = calc.calculateLevel(getForm(), mode, condensateEnabled);
        showErrors(calculation.errorList);
        if (calculation.result) {
            renderResult(calculation);
            if (save) {
                const now = new Date();
                const record = {
                    id: String(now.getTime()) + String(Math.floor(Math.random() * 1000)),
                    createdAt: dateText(now),
                    mode: mode,
                    modeText: calc.MODE_LABELS[mode] || mode,
                    rangeText: calculation.result.rangeText,
                    migrationText: calculation.result.migrationType + ' ' + calculation.result.migrationText + ' kPa',
                    staticText: calculation.result.staticCheck ? calculation.result.staticCheck.status : '无需膜片静压核验',
                    form: getForm(),
                };
                history = [record].concat(history).slice(0, MAX_HISTORY);
                saveHistory();
                renderHistory();
            }
        } else {
            clearResult();
        }
    }

    function renderHistory() {
        const list = $('history-list');
        if (history.length === 0) {
            list.innerHTML = '<div class="empty"><div class="empty-sym">∅</div><div>暂无计算历史</div><div class="empty-cap">完成一次计算后会自动保存在本机</div></div>';
            return;
        }
        list.innerHTML = history.map((h) => '<div class="history-card" data-id="' + h.id + '">'
            + '<div class="h-top"><span class="h-mode">' + escapeHtml(h.modeText) + '</span><span class="h-time">' + escapeHtml(h.createdAt) + '</span></div>'
            + '<div class="h-range">' + escapeHtml(h.rangeText) + '</div>'
            + '<div class="h-migration">' + escapeHtml(h.migrationText) + '</div>'
            + '<div class="h-bottom"><span class="h-static">' + escapeHtml(h.staticText) + '</span>'
            + '<button class="btn-link delete" data-id="' + h.id + '">删除</button></div>'
            + '<div class="h-load">点击记录可恢复参数并重新计算</div>'
            + '</div>').join('');
    }

    function applyHistoryRecord(id) {
        const rec = history.find((h) => h.id === id);
        if (!rec) return;
        mode = rec.mode;
        condensateEnabled = rec.form.condensateDensity !== undefined && rec.form.condensateDensity !== '';
        document.querySelectorAll('.mode').forEach((el) => {
            el.classList.toggle('active', el.dataset.mode === rec.mode);
        });
        $('condensateEnabled').checked = condensateEnabled;
        fillForm(rec.form);
        applyModeUI();
        document.querySelector('.tab[data-tab="calculator"]').click();
        calculate(false);
    }

    function switchTab(tab) {
        document.querySelectorAll('.tab').forEach((el) => {
            el.classList.toggle('active', el.dataset.tab === tab);
        });
        $('calculator-panel').classList.toggle('hidden', tab !== 'calculator');
        $('history-panel').classList.toggle('hidden', tab !== 'history');
        if (tab === 'history') renderHistory();
    }

    function clearAllHistory() {
        if (history.length === 0) return;
        if (confirm('将删除本机保存的全部计算记录，是否继续？')) {
            history = [];
            saveHistory();
            renderHistory();
        }
    }

    // 事件绑定
    document.querySelectorAll('.tab').forEach((el) => {
        el.addEventListener('click', () => switchTab(el.dataset.tab));
    });
    document.querySelectorAll('.mode').forEach((el) => {
        el.addEventListener('click', () => switchMode(el.dataset.mode));
    });
    $('loadExample').addEventListener('click', () => {
        fillForm(DEFAULT_FORMS[mode]);
        applyModeUI();
        clearResult();
    });
    $('calculate').addEventListener('click', () => calculate(true));
    $('condensateEnabled').addEventListener('change', (e) => {
        condensateEnabled = e.target.checked;
        $('condensateDensityField').style.display = condensateEnabled ? '' : 'none';
    });
    $('clearHistory').addEventListener('click', clearAllHistory);

    $('history-list').addEventListener('click', (e) => {
        const card = e.target.closest('.history-card');
        if (!card) return;
        if (e.target.classList.contains('delete')) {
            history = history.filter((h) => h.id !== card.dataset.id);
            saveHistory();
            renderHistory();
        } else {
            applyHistoryRecord(card.dataset.id);
        }
    });

    // 初始化
    fillForm(DEFAULT_FORMS.flange);
    applyModeUI();
    renderHistory();
})();
