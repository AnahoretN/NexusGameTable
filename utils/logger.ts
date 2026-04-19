/**
 * Simple logger utility for consistent logging across the app
 * In production, these can be disabled or replaced with a proper logging service
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    // All logging disabled
  },

  warn: (...args: unknown[]) => {
    // Warning logging disabled
  },

  error: (...args: unknown[]) => {
    // Keep only error logging
    console.error('[Nexus]', ...args);
  },

  debug: (...args: unknown[]) => {
    // Debug logging disabled
  },
};
