export function integrationConnectionAction(status: string | undefined): "AUTHORIZE" | "SYNC" {
  return status === "CONNECTED" || status === "ERROR" ? "SYNC" : "AUTHORIZE";
}
