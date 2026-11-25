/** Synchronizer ids are exact strings. `:` must not be stored as `%3A`. */
export function rawSynchronizerId(value: string): string {
  let current = value.trim();
  for (let attempt = 0; attempt < 2 && current.includes("%"); attempt += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) {
        return current;
      }
      current = decoded;
    } catch {
      return current;
    }
  }
  return current;
}
