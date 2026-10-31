// Single import point for the view library. htm's standalone build bundles Preact + hooks + htm in one module,
// so there are no duplicate-instance hook bugs. Swap this file for a bundler import later.
export {
  html, render, h, Component, createContext,
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext, useReducer,
} from 'https://unpkg.com/htm@3.1.1/preact/standalone.module.js';
