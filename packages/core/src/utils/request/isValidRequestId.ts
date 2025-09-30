export function isValidRequestId(requestId: string, prefix?: string): boolean {
  return new RegExp(`^${prefix ? `${prefix}_` : ''}\\d+_[a-f0-9]{8}$`).test(
    requestId,
  );
}
