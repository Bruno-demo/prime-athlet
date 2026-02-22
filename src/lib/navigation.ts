export function sanitizeNextPath(input: string | undefined): string {
  if (!input) {
    return "/account";
  }

  if (!input.startsWith("/") || input.startsWith("//")) {
    return "/account";
  }

  return input;
}
