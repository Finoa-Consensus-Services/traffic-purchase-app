export function normalizeMemberId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("PAR::") || trimmed.startsWith("MED::")) {
    return trimmed;
  }
  return `PAR::${trimmed}`;
}

export function isMemberIdInput(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.startsWith("PAR::") || trimmed.startsWith("MED::");
}
