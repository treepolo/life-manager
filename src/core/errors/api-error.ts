export type ApiErrorCode =
  | "ACCESS_UNAUTHORIZED"
  | "ACCESS_CONFIGURATION_MISSING"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "SYNC_VERSION_CONFLICT"
  | "MISSING_EXCHANGE_RATE"
  | "FORMULA_INVALID"
  | "FORMULA_DIVISION_BY_ZERO"
  | "FORMULA_MISSING_INPUT"
  | "IMPORT_INVALID"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_CONFIGURATION_MISSING"
  | "PROVIDER_ERROR"
  | "PROVIDER_SYNC_IN_PROGRESS"
  | "NOTIFICATION_CONFIGURATION_MISSING"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown, requestId: string): Response {
  const safe =
    error instanceof ApiError
      ? error
      : new ApiError(500, "INTERNAL_ERROR", "伺服器處理失敗，請稍後重試。", {});

  return Response.json(
    {
      error: {
        code: safe.code,
        message: safe.message,
        details: safe.details,
        requestId,
      },
    },
    { status: safe.status },
  );
}
