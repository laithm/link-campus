/** Preserve a shared app link through login, accepting only local routes. */
export function returnPath(state: unknown): string {
  const from =
    state && typeof state === "object" && "from" in state
      ? state.from
      : undefined;
  return typeof from === "string" &&
    from.startsWith("/") &&
    !from.startsWith("//") &&
    !/[\\\u0000-\u001f]/.test(from)
    ? from
    : "/";
}
