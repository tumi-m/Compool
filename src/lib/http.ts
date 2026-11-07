/**
 * Reading a request body without trusting its size.
 *
 * `await req.json()` reads whatever it is sent, of any size, into memory before
 * anything can look at it — so one large POST is a memory problem for every
 * other request on the instance. This stops reading the moment the body passes
 * the limit, and refuses a declared length over it without reading at all.
 */
export type ReadResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

export async function readJson(req: Request, maxBytes: number): Promise<ReadResult> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: `body is over ${maxBytes} bytes` };
  }
  if (!req.body) return { ok: false, status: 400, error: 'empty body' };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: `body is over ${maxBytes} bytes` };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' };
  }
}

/** Constant-time comparison of a bearer header against the expected secret. */
export async function bearerMatches(header: string | null, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  // Hash both sides first so the comparison is over equal lengths and leaks
  // neither the secret's length nor how much of it matched.
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(header ?? '')),
    crypto.subtle.digest('SHA-256', enc.encode(`Bearer ${secret}`)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
