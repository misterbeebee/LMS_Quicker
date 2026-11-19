/**
 * Shared IPC channel names between Electron main and sandboxed preload.
 * Kept zero-dependency so preload.cjs stays tiny and fast.
 */
export const VELM_IPC_CHANNELS = {
  getMeta: 'velm:getMeta',
  httpRequest: 'velm:httpRequest',
  synergyVerify: 'velm:synergy:verify',
  synergyStudentInfo: 'velm:synergy:getStudentInfo',
  synergyGradebook: 'velm:synergy:getGradebook',
  synergyExportAll: 'velm:synergy:exportAll',
  llmListPresets: 'velm:llm:listPresets',
  llmDiscoverLocal: 'velm:llm:discoverLocal',
  llmTest: 'velm:llm:test',
  llmGenerate: 'velm:llm:generate',
  secretsSet: 'velm:secrets:set',
  secretsHas: 'velm:secrets:has',
  secretsDel: 'velm:secrets:del',
} as const;
