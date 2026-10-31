const calculator = require('../../utils/level-calculator');

const STORAGE_KEY = 'dp-level-calculation-history';
const MAX_HISTORY = 20;

function defaultForm(mode) {
    if (mode === 'impulse') {
        return {
            processDensity: '800',
            minLevel: '0.20',
            levelSpan: '1.80',
            tapGap: '2.00',
            hpColumn: '0.80',
            fillDensity: '950',
            isolDensity: '1000',
            condensateDensity: '998',
            operatingPressure: '200',
            staticMin: '-100',
            staticMax: '1000',
        };
    }
    if (mode === 'single-flange') {
        return {
            processDensity: '1000',
            minLevel: '0.00',
            levelSpan: '2.00',
            tapGap: '0',
            hpColumn: '0.00',
            fillDensity: '950',
            isolDensity: '1000',
            condensateDensity: '998',
            operatingPressure: '200',
            staticMin: '-100',
            staticMax: '1000',
        };
    }
    return {
        processDensity: '1000',
        minLevel: '0.00',
        levelSpan: '2.00',
        tapGap: '2.50',
        hpColumn: '1.00',
        fillDensity: '950',
        isolDensity: '1000',
        condensateDensity: '998',
        operatingPressure: '200',
        staticMin: '-100',
        staticMax: '1000',
    };
}

function dateText(date) {
    const pad = value => value < 10 ? '0' + value : String(value);
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

Page({
    data: {
        activeTab: 'calculator',
        mode: 'flange',
        condensateEnabled: true,
        form: defaultForm('flange'),
        errors: {},
        errorList: [],
        warnings: [],
        result: null,
        history: [],
    },

    onLoad() {
        this.loadHistory();
    },

    switchTab(event) {
        this.setData({ activeTab: event.currentTarget.dataset.tab });
        if (event.currentTarget.dataset.tab === 'history') {
            this.loadHistory();
        }
    },

    switchMode(event) {
        const mode = event.currentTarget.dataset.mode;
        if (!mode || mode === this.data.mode) {
            return;
        }
        this.setData({
            mode: mode,
            form: defaultForm(mode),
            errors: {},
            errorList: [],
            warnings: [],
            result: null,
        });
    },

    loadExample() {
        this.setData({
            form: defaultForm(this.data.mode),
            condensateEnabled: true,
            errors: {},
            errorList: [],
            warnings: [],
            result: null,
        });
        wx.showToast({ title: '已载入示例', icon: 'none' });
    },

    handleInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) {
            return;
        }
        const update = {};
        update['form.' + field] = event.detail.value;
        update['errors.' + field] = '';
        this.setData(update);
    },

    toggleCondensate(event) {
        this.setData({
            condensateEnabled: event.detail.value,
            errors: {},
            errorList: [],
        });
    },

    handleCalculate() {
        this.runCalculation(true);
    },

    runCalculation(saveToHistory) {
        const calculation = calculator.calculateLevel(
            this.data.form,
            this.data.mode,
            this.data.condensateEnabled
        );
        this.setData({
            errors: calculation.errors,
            errorList: calculation.errorList,
            warnings: calculation.warnings,
            result: calculation.result,
        });
        if (calculation.result && saveToHistory) {
            this.saveHistory(calculation.result);
        }
        if (calculation.errorList.length > 0) {
            wx.showToast({ title: '请检查输入参数', icon: 'none' });
        }
    },

    saveHistory(result) {
        const now = new Date();
        const record = {
            id: String(now.getTime()) + String(Math.floor(Math.random() * 1000)),
            createdAt: dateText(now),
            mode: this.data.mode,
            condensateEnabled: this.data.condensateEnabled,
            form: Object.assign({}, this.data.form),
            result: result,
            modeText: calculator.MODE_LABELS[this.data.mode] || '双法兰',
            rangeText: result.rangeText,
            migrationText: result.migrationType + ' ' + result.migrationText + ' kPa',
            staticText: result.staticCheck ? result.staticCheck.status : '无需膜片静压核验',
        };
        const history = [record].concat(this.data.history).slice(0, MAX_HISTORY);
        this.setData({ history: history });
        try {
            wx.setStorageSync(STORAGE_KEY, history);
        } catch (error) {
            wx.showToast({ title: '计算完成，历史保存失败', icon: 'none' });
        }
    },

    loadHistory() {
        try {
            const history = wx.getStorageSync(STORAGE_KEY);
            this.setData({ history: Array.isArray(history) ? history : [] });
        } catch (error) {
            this.setData({ history: [] });
            wx.showToast({ title: '历史记录读取失败', icon: 'none' });
        }
    },

    applyHistory(event) {
        const id = event.currentTarget.dataset.id;
        const record = this.data.history.find(item => item.id === id);
        if (!record) {
            wx.showToast({ title: '记录不存在', icon: 'none' });
            return;
        }
        this.setData({
            activeTab: 'calculator',
            mode: record.mode,
            condensateEnabled: record.condensateEnabled,
            form: Object.assign({}, record.form),
            errors: {},
            errorList: [],
            warnings: [],
            result: null,
        }, () => {
            this.runCalculation(false);
        });
    },

    deleteHistory(event) {
        const id = event.currentTarget.dataset.id;
        const history = this.data.history.filter(item => item.id !== id);
        this.setData({ history: history });
        try {
            wx.setStorageSync(STORAGE_KEY, history);
        } catch (error) {
            wx.showToast({ title: '删除失败，请重试', icon: 'none' });
        }
    },

    clearHistory() {
        if (this.data.history.length === 0) {
            return;
        }
        wx.showModal({
            title: '清空计算历史',
            content: '将删除本机保存的全部计算记录，是否继续？',
            confirmColor: '#c2413b',
            success: response => {
                if (!response.confirm) {
                    return;
                }
                try {
                    wx.removeStorageSync(STORAGE_KEY);
                    this.setData({ history: [] });
                    wx.showToast({ title: '已清空', icon: 'none' });
                } catch (error) {
                    wx.showToast({ title: '清空失败，请重试', icon: 'none' });
                }
            },
        });
    },
});
