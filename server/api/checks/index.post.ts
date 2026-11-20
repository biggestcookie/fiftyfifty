import { createSharedCheck } from "~~/shared/server/check-service";
import { defaultCheckStore } from "~~/shared/server/check-store";

export default defineEventHandler(async (event) => {
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
  const result = await createSharedCheck(store, body);
  setResponseStatus(event, result.status);
  return result.body;
});
