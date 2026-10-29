// Use decimal MB to stay below both 20 MB and 20 MiB hosting limits.
export const MAX_DEPLOY_BYTES = 20_000_000;
export const MAX_PUBLIC_PDF_BYTES = Math.min(
  Number(process.env.PUBLIC_PDF_MAX_BYTES ?? MAX_DEPLOY_BYTES),
  MAX_DEPLOY_BYTES,
);
export const PDF_CHUNK_BYTES = Math.min(
  Number(process.env.PUBLIC_PDF_CHUNK_BYTES ?? 8_000_000),
  MAX_DEPLOY_BYTES,
);
if (![MAX_PUBLIC_PDF_BYTES, PDF_CHUNK_BYTES].every((n) => Number.isSafeInteger(n) && n > 0)) {
  throw new Error("PDF size limits must be positive integer byte counts");
}
