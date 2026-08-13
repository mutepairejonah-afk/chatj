// src/empty-module.js
// Empty module to mock Node.js modules in browser environment
export default {};
export const AsyncLocalStorage = class AsyncLocalStorage {
  run(store, callback) {
    return callback();
  }
  getStore() {
    return undefined;
  }
};
