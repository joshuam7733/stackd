import { html, useState, useEffect } from '../lib/preact.js';

// Hash router: works on any static host with no server rewrites.
const listeners = new Set();
let lastPath = null;

export function parse() {
  const raw = decodeURI(location.hash.slice(1) || '/');
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function emit() {
  const loc = parse();
  if (loc.path !== lastPath) {
    window.scrollTo({ top: 0 });
    lastPath = loc.path;
  }
  listeners.forEach((f) => f(loc));
}
window.addEventListener('hashchange', emit);

export function navigate(to, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', '#' + to);
    emit();
  } else if (location.hash === '#' + to) {
    emit();
  } else {
    location.hash = to;
  }
}

/** Update query params without a new history entry (filters, tabs). */
export function setQuery(patch) {
  const { path, query } = parse();
  const next = { ...query, ...patch };
  Object.keys(next).forEach((k) => (next[k] === undefined || next[k] === null || next[k] === '') && delete next[k]);
  const qs = new URLSearchParams(next).toString();
  navigate(path + (qs ? '?' + qs : ''), { replace: true });
}

export function useLocation() {
  const [loc, setLoc] = useState(parse);
  useEffect(() => {
    listeners.add(setLoc);
    return () => listeners.delete(setLoc);
  }, []);
  return loc;
}

export function matchRoute(pattern, path) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '/([^/]+)')) + '/?$');
  const m = path.match(re);
  if (!m) return null;
  return Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}

export function Link({ href, children, class: cls, ...rest }) {
  return html`<a href=${'#' + href} class=${cls} ...${rest}>${children}</a>`;
}

export function isActive(path, href, exact = false) {
  return exact ? path === href : path === href || path.startsWith(href + '/');
}
