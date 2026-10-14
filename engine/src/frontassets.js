// src/frontassets.js — the front door's pictures, self-hosted (sprint 21, 21.P): the walkthrough's five posters and the two client
// logos the connect page shows, the website's own files (engine/assets/walkthrough, engine/assets/clients), and (21.4a) U-chan's mark
// the emails show (engine/assets/brand/uchan-mark.png, src/mails.js), bundled as base64 by
// tools/make-front-assets.mjs into src/frontassetdata.js. GET /assets/<dir>/<file> serves them from the worker itself (src/index.js,
// before the address, any auth or any D1 read), the way src/fonts.js serves the faces: nothing hotlinked, nothing third-party. A
// picture's URL carries FRONT_ASSET_VERSION, so the response is cached a year as immutable; a changed picture is a new URL.
import { FRONT_ASSET_B64, FRONT_ASSET_VERSION } from "./frontassetdata.js";

export { FRONT_ASSET_VERSION };
const TYPES = { jpg: "image/jpeg", png: "image/png" };
// frontAssetHref(path) -> the picture's versioned URL ("walkthrough/1-join-and-connect.jpg" -> /assets/walkthrough/…?v=<hash>)
export const frontAssetHref = (path) => `/assets/${path}?v=${FRONT_ASSET_VERSION}`;

// frontAssetResponse(path, method) -> the picture's Response (GET or HEAD), or null for a path that is not one of them
const decoded = new Map();
export function frontAssetResponse(path, method = "GET") {
  const name = String(path || "");
  if (!Object.prototype.hasOwnProperty.call(FRONT_ASSET_B64, name)) return null;
  let bytes = decoded.get(name);
  if (!bytes) {
    const bin = atob(FRONT_ASSET_B64[name]);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded.set(name, bytes);
  }
  return new Response(method === "HEAD" ? null : bytes, {
    status: 200,
    headers: { "content-type": TYPES[name.split(".").pop()], "cache-control": "public, max-age=31536000, immutable", "content-length": String(bytes.length),
      "x-content-type-options": "nosniff" },
  });
}
