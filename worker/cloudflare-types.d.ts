/**
 * Minimal ambient type declarations for the Cloudflare Workers runtime
 * bindings used in worker/index.ts.
 *
 * The full types ship with the `@cloudflare/workers-types` package, but that
 * package is only available as a transitive/dev dependency of
 * `@cloudflare/vite-plugin` and is not installed in this project's
 * node_modules. Declaring the minimal shapes actually used here avoids
 * adding a new dependency just to satisfy `tsc`.
 */

interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
