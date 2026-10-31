// Minimal schema validation. Every RPC declares its params; unknown fields are rejected.
import { E } from './errors.js';

export const s = {
  str: (o = {}) => ({ t: 'str', ...o }),
  num: (o = {}) => ({ t: 'num', ...o }),
  int: (o = {}) => ({ t: 'num', int: true, ...o }),
  bool: (o = {}) => ({ t: 'bool', ...o }),
  oneOf: (values, o = {}) => ({ t: 'enum', values, ...o }),
  arr: (item, o = {}) => ({ t: 'arr', item, ...o }),
  obj: (shape, o = {}) => ({ t: 'obj', shape, ...o }),
  record: (o = {}) => ({ t: 'record', ...o }), // free-form object of numbers/strings (e.g. stat lines)
  any: (o = {}) => ({ t: 'any', ...o }),
  opt: (schema) => ({ ...schema, optional: true }),
};

export function check(schema, value, path = 'params') {
  if (value === undefined || value === null || value === '') {
    if (schema.optional) return schema.default ?? (value === '' && schema.t === 'str' ? '' : undefined);
    throw E.invalid(`${label(path)} is required.`, { path });
  }
  switch (schema.t) {
    case 'str': {
      if (typeof value !== 'string') throw E.invalid(`${label(path)} must be text.`, { path });
      const v = schema.trim === false ? value : value.trim();
      if (schema.min && v.length < schema.min) throw E.invalid(`${label(path)} needs at least ${schema.min} characters.`, { path });
      if (schema.max && v.length > schema.max) throw E.invalid(`${label(path)} can be at most ${schema.max} characters.`, { path });
      if (schema.pattern && !new RegExp(schema.pattern).test(v)) throw E.invalid(schema.patternMessage || `${label(path)} has an invalid format.`, { path });
      return v;
    }
    case 'num': {
      const v = typeof value === 'string' ? Number(value) : value;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw E.invalid(`${label(path)} must be a number.`, { path });
      if (schema.int && !Number.isInteger(v)) throw E.invalid(`${label(path)} must be a whole number.`, { path });
      if (schema.min != null && v < schema.min) throw E.invalid(`${label(path)} must be at least ${schema.min.toLocaleString()}.`, { path });
      if (schema.max != null && v > schema.max) throw E.invalid(`${label(path)} must be at most ${schema.max.toLocaleString()}.`, { path });
      return v;
    }
    case 'bool':
      if (typeof value !== 'boolean') throw E.invalid(`${label(path)} must be true or false.`, { path });
      return value;
    case 'enum':
      if (!schema.values.includes(value)) throw E.invalid(`${label(path)} isn't a valid option.`, { path });
      return value;
    case 'arr': {
      if (!Array.isArray(value)) throw E.invalid(`${label(path)} must be a list.`, { path });
      if (schema.max && value.length > schema.max) throw E.invalid(`${label(path)} can have at most ${schema.max} items.`, { path });
      if (schema.min && value.length < schema.min) throw E.invalid(`${label(path)} needs at least ${schema.min}.`, { path });
      return value.map((x, i) => check(schema.item, x, `${path}[${i}]`));
    }
    case 'obj': {
      if (typeof value !== 'object' || Array.isArray(value)) throw E.invalid(`${label(path)} is malformed.`, { path });
      const out = {};
      for (const k of Object.keys(value)) if (!(k in schema.shape)) throw E.invalid(`Unexpected field "${k}".`, { path: `${path}.${k}` });
      for (const [k, sub] of Object.entries(schema.shape)) {
        const v = check(sub, value[k], `${path}.${k}`);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    case 'record': {
      if (typeof value !== 'object' || Array.isArray(value)) throw E.invalid(`${label(path)} is malformed.`, { path });
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (!/^[a-zA-Z0-9_]{1,24}$/.test(k)) throw E.invalid(`Bad key in ${label(path)}.`, { path });
        if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') throw E.invalid(`Bad value in ${label(path)}.`, { path });
        out[k] = typeof v === 'string' ? v.slice(0, 200) : v;
      }
      return out;
    }
    default:
      return value;
  }
}

function label(path) {
  const last = path.split('.').pop().replace(/\[\d+\]$/, '');
  const words = last.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
