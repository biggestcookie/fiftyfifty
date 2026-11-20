import { patchSharedCheck } from "~~/shared/server/check-service";
import { defaultCheckStore } from "~~/shared/server/check-store";
import { bearerToken, isShareId } from "~~/shared/server/tokens";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "id") ?? "";
  if (!isShareId(shareId)) {
    return apiError(event, 404, "not_found", "Could not find this check.");
  }

  const { body, tooLarge } = await readJsonObject(event);
  if (tooLarge) {
    return apiError(
      event,
      413,
      "body_too_large",
      "Check payload must be 64 KB or smaller."
    );
  }
  if (!body) {
    return apiError(
      event,
      400,
      "invalid_body",
      "Request body must be a JSON object."
    );
  }

  const store = await defaultCheckStore();
  const token = bearerToken(getHeader(event, "authorization"));
  const result = await patchSharedCheck(store, shareId, { token, body });
  setResponseStatus(event, result.status);
  return result.body;
});
