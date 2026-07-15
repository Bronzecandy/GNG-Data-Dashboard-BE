import type { TabData } from "../tabs.service";
import {
  buildActiveOnlineTimeTab,
  buildActiveUserTab,
  buildChurnTab,
  buildNewDeviceRetentionTab,
  buildNewUserRetentionTab,
  buildRevivalTab,
} from "./legacy";
import {
  buildEconomyTab,
  buildHackCheatTab,
  buildModeMatchmakingTab,
  buildNewbieStatsTab,
  buildPerformanceTab,
} from "./extra-tabs";

export {
  dateRangeFromFacts,
  label,
  loadFacts,
  loadSeedTemplate,
  seriesFromMeasure,
} from "./core";

export {
  buildActiveOnlineTimeTab,
  buildActiveUserTab,
  buildChurnTab,
  buildNewDeviceRetentionTab,
  buildNewUserRetentionTab,
  buildRevivalTab,
} from "./legacy";

export {
  buildEconomyTab,
  buildHackCheatTab,
  buildModeMatchmakingTab,
  buildNewbieStatsTab,
  buildPerformanceTab,
} from "./extra-tabs";

const REAL_TAB_BUILDERS: Record<string, (ip?: string) => Promise<TabData>> = {
  "new-user-retention": buildNewUserRetentionTab,
  "new-device-retention": buildNewDeviceRetentionTab,
  "active-user": buildActiveUserTab,
  "active-online-time": buildActiveOnlineTimeTab,
  revival: buildRevivalTab,
  churn: buildChurnTab,
  economy: buildEconomyTab,
  "hack-cheat-teamup": buildHackCheatTab,
  "mode-matchmaking": buildModeMatchmakingTab,
  performance: buildPerformanceTab,
  "newbie-stats": buildNewbieStatsTab,
};

export async function buildRealTabData(tabId: string, ipRegion = "VN"): Promise<TabData | null> {
  const builder = REAL_TAB_BUILDERS[tabId];
  if (!builder) return null;
  return builder(ipRegion);
}

export function isRealDataTab(tabId: string): boolean {
  return tabId in REAL_TAB_BUILDERS;
}
