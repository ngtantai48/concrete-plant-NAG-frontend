export function resolveHttpBaseUrl(
  configuredUrl: string | undefined,
  browserOrigin: string | undefined,
  useSameOrigin: boolean
): string | undefined {
  if (useSameOrigin && browserOrigin) {
    return new URL("/api/v1/", browserOrigin).toString();
  }

  return configuredUrl;
}
