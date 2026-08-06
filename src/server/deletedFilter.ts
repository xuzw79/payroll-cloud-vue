export function deletedFilterFromQuery(query: { includeDeleted?: string | null; deletedOnly?: string | null }) {
  if (query.deletedOnly === "true") return true;
  if (query.includeDeleted === "true") return undefined;
  return false;
}
