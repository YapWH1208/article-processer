export function buildOpenReviewSettingsPayload({
  username,
  password,
  accessToken,
  clearPassword = false,
  clearAccessToken = false,
}) {
  const payload = {
    openreview_username: (username || "").trim(),
  };

  if (clearPassword) {
    payload.openreview_password = "";
  } else if (password) {
    payload.openreview_password = password;
  }

  const normalizedToken = (accessToken || "").trim();
  if (clearAccessToken) {
    payload.openreview_access_token = "";
  } else if (normalizedToken) {
    payload.openreview_access_token = normalizedToken;
  }

  return payload;
}
