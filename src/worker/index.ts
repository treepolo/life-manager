import { requireAccess } from "@/core/auth/cloudflare-access";
import { ApiError, errorResponse } from "@/core/errors/api-error";
import { handleApi } from "@/worker/api";
import { finishOAuth } from "@/worker/api/oauth";
import type { Env } from "@/worker/env";
import { runScheduled } from "@/worker/scheduled";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/oauth/")) {
        const actor = await requireAccess(request, env);
        if (url.pathname.startsWith("/oauth/")) {
          const match = url.pathname.match(/^\/oauth\/(youtube|instagram)\/callback$/);
          if (!match) throw new ApiError(404, "NOT_FOUND", "找不到OAuth callback路徑。");
          return await finishOAuth({ request, env, providerKey: match[1] });
        }
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

  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    context.waitUntil(runScheduled(env, controller.scheduledTime));
  },
};
import { ZodError } from "zod";
