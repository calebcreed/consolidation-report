// S9: Side-effect only module
// This file is imported for its side effects, not for any exports

// Example: Register something globally
(window as any).__APP_VERSION__ = '1.0.0';

// Example: Polyfill
if (!Array.prototype.flat) {
  // polyfill implementation
}

// Example: Extend prototype (not recommended but exists in legacy code)
declare global {
  interface String {
    toTitleCase(): string;
  }
}

String.prototype.toTitleCase = function() {
  return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
};

// No exports - this file is purely for side effects
export {};
