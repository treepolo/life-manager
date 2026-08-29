import { ZodError } from "zod";

import { requireAccess } from "@/core/auth/cloudflare-access";
import { ApiError, errorResponse } from "@/core/errors/api-error";
import { handleApi } from "@/worker/api";
import type { Env } from "@/worker/env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        const actor = await requireAccess(request, env);
        return await handleApi({ request, env, actorId: actor.actorId, requestId });
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse(new ApiError(400, "VALIDATION_FAILED", "請求資料驗證失敗。", {
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        }), requestId);
      }
      return errorResponse(error, requestId);
    }
  },
};
