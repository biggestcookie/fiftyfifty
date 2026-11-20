import { getSharedCheck } from "~~/shared/server/check-service";
import { defaultCheckStore } from "~~/shared/server/check-store";
import { isShareId } from "~~/shared/server/tokens";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "id") ?? "";
  if (!isShareId(shareId)) {
    return apiError(
      event,
      404,
      "not_found",
      "Could not find this check. Ask your host to share it again."
    );
  }

  const store = await defaultCheckStore();
  const result = await getSharedCheck(store, shareId);
  setResponseStatus(event, result.status);
  return result.body;
});
