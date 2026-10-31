# 差压液位计算 — 桌面版（Electron）

与微信小程序共享同一套计算模型（`level-calculator.js`），提供 Windows 桌面版。

## 开发运行

```bash
cd desktop
npm install
npm start
```

## 打包 exe

```bash
cd desktop
npm run dist
```

打包产物输出到 `desktop/dist/`，生成 NSIS 安装包 `dp-level-calculator-1.0.0-setup.exe`。

## 说明

- 计算逻辑复用 `miniprogram/utils/level-calculator.js`（本目录 `level-calculator.js` 为其拷贝），
  计算模型已通过 17 组回归测试（见 `../tests/calculator.test.js`）。
- 渲染进程通过 `level-calculator.browser.js`（浏览器全局导出版）调用同一计算函数，
  保证桌面版与小程序计算结果一致。
- 历史记录使用 `localStorage` 保存在本机，最多保留 20 次。
