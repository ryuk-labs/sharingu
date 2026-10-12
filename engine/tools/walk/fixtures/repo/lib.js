// lib.js — the two route constructors routes.js uses. A page is a screen a person sees; an api is a door a script calls.
export const page = (route, id, name, opts = {}) => ({ type: "page", route, id, name, ...opts });
export const api = (route, opts = {}) => ({ type: "api", route, ...opts });
