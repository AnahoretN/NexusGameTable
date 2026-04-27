/**
 * Simple logger utility for consistent logging across the app
 * In production, these can be disabled or replaced with a proper logging service
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[Nexus]', ...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn('[Nexus]', ...args);
    }
  },

  error: (...args: unknown[]) => {
    // Keep only error logging
    console.error('[Nexus]', ...args);
  },

  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[Nexus DEBUG]', ...args);
    }
  },
};
