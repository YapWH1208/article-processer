import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenReviewSettingsPayload } from "./openreviewSettingsState.mjs";

test("leaves saved OpenReview secrets unchanged when inputs are blank", () => {
  assert.deepEqual(
    buildOpenReviewSettingsPayload({
      username: "  user@example.com  ",
      password: "",
      accessToken: "",
    }),
    { openreview_username: "user@example.com" },
  );
});

test("includes newly entered OpenReview credentials", () => {
  assert.deepEqual(
    buildOpenReviewSettingsPayload({
      username: "user@example.com",
      password: "new password",
      accessToken: "  new-token  ",
    }),
    {
      openreview_username: "user@example.com",
      openreview_password: "new password",
      openreview_access_token: "new-token",
    },
  );
});

test("explicit clear actions override credential inputs", () => {
  assert.deepEqual(
    buildOpenReviewSettingsPayload({
      username: "user@example.com",
      password: "do-not-send",
      accessToken: "do-not-send",
      clearPassword: true,
      clearAccessToken: true,
    }),
    {
      openreview_username: "user@example.com",
      openreview_password: "",
      openreview_access_token: "",
    },
  );
});
