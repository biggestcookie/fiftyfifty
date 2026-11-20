import { deleteSharedCheck } from "~~/shared/server/check-service";
import { defaultCheckStore } from "~~/shared/server/check-store";
import { bearerToken, isShareId } from "~~/shared/server/tokens";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "id") ?? "";
  if (!isShareId(shareId)) {
    return apiError(event, 404, "not_found", "Could not find this check.");
  }

  const store = await defaultCheckStore();
  const token = bearerToken(getHeader(event, "authorization"));
  const result = await deleteSharedCheck(store, shareId, { token });
  setResponseStatus(event, result.status);
  return result.body;
});
