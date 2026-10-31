const { contextBridge } = require('electron');

// 通过 preload 暴露一个最小化的安全 API；计算逻辑在渲染进程直接 require 本地模块即可，
// 此处保留通道以备后续扩展（如打开外部文档）。
contextBridge.exposeInMainWorld('desktop', {
    platform: process.platform,
    versions: {
        electron: process.versions.electron,
        node: process.versions.node,
    },
});
