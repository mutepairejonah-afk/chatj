// src/empty-module.js
// Mock for Node.js async_hooks in browser environment

export class AsyncLocalStorage {
  constructor() {
    this.store = undefined;
  }

  run(store, callback) {
    const previousStore = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = previousStore;
    }
  }

  getStore() {
    return this.store;
  }

  disable() {
    this.store = undefined;
  }

  enterWith(store) {
    this.store = store;
  }
}

// Default export for compatibility
export default {
  AsyncLocalStorage,
};

// Mock other common Node.js modules
export const createHook = () => ({ enable: () => {}, disable: () => {} });
export const executionAsyncId = () => 0;
export const triggerAsyncId = () => 0;
export const executionAsyncResource = () => ({});
