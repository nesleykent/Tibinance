// SHA-256 of the raw file bytes. Used only as a duplicate key -
// the bytes themselves are never kept once hashing is done.
export async function sha256(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
