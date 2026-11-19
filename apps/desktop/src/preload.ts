import { contextBridge, ipcRenderer } from 'electron';
import type { VelmBackend } from '@velm/core';
import { VELM_IPC_CHANNELS } from './channels.js';

/**
 * Sandboxed preload script exposing the narrow VelmBackend RPC surface to the renderer
 * as `window.__VELM_BACKEND__`. Secrets and Node APIs never cross into the renderer.
 */
const velmBackend: VelmBackend = {
  getMeta: () => ipcRenderer.invoke(VELM_IPC_CHANNELS.getMeta),
  httpRequest: (req) => ipcRenderer.invoke(VELM_IPC_CHANNELS.httpRequest, req),
  synergy: {
    verify: (input) => ipcRenderer.invoke(VELM_IPC_CHANNELS.synergyVerify, input),
    getStudentInfo: (input) => ipcRenderer.invoke(VELM_IPC_CHANNELS.synergyStudentInfo, input),
    getGradebook: (input) => ipcRenderer.invoke(VELM_IPC_CHANNELS.synergyGradebook, input),
    exportAll: (input) => ipcRenderer.invoke(VELM_IPC_CHANNELS.synergyExportAll, input),
  },
  llm: {
    listPresets: () => ipcRenderer.invoke(VELM_IPC_CHANNELS.llmListPresets),
    discoverLocal: () => ipcRenderer.invoke(VELM_IPC_CHANNELS.llmDiscoverLocal),
    test: (config) => ipcRenderer.invoke(VELM_IPC_CHANNELS.llmTest, config),
    generate: (config, req) => ipcRenderer.invoke(VELM_IPC_CHANNELS.llmGenerate, config, req),
  },
  secrets: {
    set: (key, value) => ipcRenderer.invoke(VELM_IPC_CHANNELS.secretsSet, { key, value }),
    has: (key) => ipcRenderer.invoke(VELM_IPC_CHANNELS.secretsHas, key),
    del: (key) => ipcRenderer.invoke(VELM_IPC_CHANNELS.secretsDel, key),
  },
};

contextBridge.exposeInMainWorld('__VELM_BACKEND__', velmBackend);
