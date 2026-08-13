// src/mocks/empty-module.js
// Complete mock for Node.js modules in browser

export class AsyncLocalStorage {
  constructor() {
    this._store = new Map();
  }

  run(store, callback) {
    this._store.set('current', store);
    try {
      return callback();
    } finally {
      this._store.delete('current');
    }
  }

  getStore() {
    return this._store.get('current');
  }

  disable() {
    this._store.clear();
  }

  enterWith(store) {
    this._store.set('current', store);
  }
}

// Mock for Clerk's server-side functions
export const createClerkServerFn = (fn) => {
  return (args) => {
    if (typeof window !== 'undefined') {
      // On client, make API call
      return fetch('/api/clerk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fn: fn.name, args }),
      }).then(res => res.json());
    }
    return fn(args);
  };
};

// Default export
export default {
  AsyncLocalStorage,
  createClerkServerFn,
};

// Mock other exports
export const createHook = () => ({ enable: () => {}, disable: () => {} });
export const executionAsyncId = () => 0;
export const triggerAsyncId = () => 0;
export const executionAsyncResource = () => ({});
