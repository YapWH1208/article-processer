// FR-7: coarse unsaved-work tracking for the settings page.
//
// The page tracks three independent groups (general / system messages /
// model params). Each group owns its baseline snapshot: the pristine
// baseline is captured once after load, and saving a group re-baselines
// ONLY that group, so a save never silently absorbs unsaved edits made in
// the other groups. Snapshots are opaque strings produced by the page,
// keeping this module pure and unit-testable.

export const SETTINGS_DIRTY_GROUPS = ["general", "systemMessages", "modelParams"];

export function createSettingsBaseline(groups) {
  return {
    general: groups.general,
    systemMessages: groups.systemMessages,
    modelParams: groups.modelParams,
  };
}

// Replace exactly one group's snapshot; every other baseline group keeps
// its previous snapshot untouched.
export function rebaselineSettingsGroup(baseline, group, snapshot) {
  return { ...baseline, [group]: snapshot };
}

// Dirty iff ANY tracked group's current snapshot differs from its baseline.
export function isSettingsDirty(baseline, currentGroups) {
  if (!baseline) return false;
  return SETTINGS_DIRTY_GROUPS.some((group) => currentGroups[group] !== baseline[group]);
}
