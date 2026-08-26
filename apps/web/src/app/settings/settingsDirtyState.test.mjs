import assert from "node:assert/strict";
import test from "node:test";

import {
  createSettingsBaseline,
  isSettingsDirty,
  rebaselineSettingsGroup,
} from "./settingsDirtyState.mjs";

const PRISTINE = {
  general: 'gen{"maxUploadMb":50}',
  systemMessages: 'sm{"extraction":"You are a helpful assistant."}',
  modelParams: 'mp{"temperature":0.7}',
};

test("pristine settings never report unsaved changes", () => {
  const baseline = createSettingsBaseline(PRISTINE);

  assert.equal(isSettingsDirty(baseline, { ...PRISTINE }), false);
});

test("saving one group re-baselines only that group and preserves other dirty state", () => {
  const baseline = createSettingsBaseline(PRISTINE);

  // Two unsaved edits at once: a model-params slider drag AND an edited
  // system message (the reviewer's repro for silently clearing dirty state).
  const afterEdits = {
    ...PRISTINE,
    systemMessages: 'sm{"extraction":"Updated persona."}',
    modelParams: 'mp{"temperature":1.2}',
  };
  assert.equal(isSettingsDirty(baseline, afterEdits), true);

  // Saving ONLY the system message re-baselines that group…
  const savedSystemMessage = rebaselineSettingsGroup(
    baseline,
    "systemMessages",
    afterEdits.systemMessages,
  );
  // …so the persisted group alone would read clean…
  assert.equal(
    isSettingsDirty(savedSystemMessage, { ...afterEdits, modelParams: PRISTINE.modelParams }),
    false,
  );
  // …but the still-unsaved model-params edit keeps the page dirty, and no
  // other baseline group was touched.
  assert.equal(isSettingsDirty(savedSystemMessage, afterEdits), true);
  assert.equal(savedSystemMessage.general, baseline.general);
  assert.equal(savedSystemMessage.modelParams, baseline.modelParams);

  // Once the edited group itself is saved (re-baselined from its current
  // values), the dirty signal clears.
  const allSaved = rebaselineSettingsGroup(
    savedSystemMessage,
    "modelParams",
    afterEdits.modelParams,
  );
  assert.equal(isSettingsDirty(allSaved, afterEdits), false);
});

test("reverting edits back to the baselined values reports clean again", () => {
  const baseline = createSettingsBaseline(PRISTINE);

  const edited = { ...PRISTINE, general: 'gen{"maxUploadMb":200}' };
  assert.equal(isSettingsDirty(baseline, edited), true);

  // Includes the model-params Reset button path: restoring the loaded values
  // makes the current snapshot equal the baseline again.
  assert.equal(isSettingsDirty(baseline, { ...edited, general: PRISTINE.general }), false);
});

test("dirty tracking waits until a baseline exists", () => {
  assert.equal(isSettingsDirty(null, PRISTINE), false);
});
