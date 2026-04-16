/**
 * 🚦 Feature Flags
 *
 * Feature flags for gradual rollout of new features and optimizations.
 *
 * Usage:
 * - Development: Set flags in .env file or directly here
 * - Production: Set environment variables before build
 *
 * Example .env file:
 *   USE_OPTIMIZED_HAND_PANEL=true
 *   USE_OPTIMIZED_TOKENS_PANEL=false
 */

/**
 * 🔥 Hand Panel Optimization
 *
 * Enables the optimized HandPanel component that uses Zustand store
 * instead of filtering all objects on every render.
 *
 * Expected improvement: ~40% fewer re-renders
 *
 * @default true (enabled by default after successful testing)
 */
export const FEATURE_FLAGS = {
  // Hand Panel - MIGRATED ✅
  USE_OPTIMIZED_HAND_PANEL: process.env.USE_OPTIMIZED_HAND_PANEL !== 'false', // Default: true

  // Tokens Panel - PENDING ⏳
  USE_OPTIMIZED_TOKENS_PANEL: process.env.USE_OPTIMIZED_TOKENS_PANEL === 'true', // Default: false

  // Deck Component - PENDING ⏳
  USE_OPTIMIZED_DECK_COMPONENT: process.env.USE_OPTIMIZED_DECK_COMPONENT === 'true', // Default: false

  // Pool Tabletop - PENDING ⏳
  USE_OPTIMIZED_POOL_TABLETOP: process.env.USE_OPTIMIZED_POOL_TABLETOP === 'true', // Default: false
} as const;

/**
 * Feature flag keys for type safety
 */
export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * Helper function to check if a feature flag is enabled
 *
 * @example
 * ```ts
 * import { isFeatureEnabled } from './constants/featureFlags';
 *
 * if (isFeatureEnabled('USE_OPTIMIZED_HAND_PANEL')) {
 *   // Use optimized version
 * }
 * ```
 */
export function isFeatureEnabled(flag: FeatureFlagKey): boolean {
  return FEATURE_FLAGS[flag] === true;
}

/**
 * Get all feature flags as an object (useful for debugging)
 */
export function getAllFeatureFlags(): Record<FeatureFlagKey, boolean> {
  return { ...FEATURE_FLAGS };
}

/**
 * Log all feature flags (useful for development)
 */
export function logFeatureFlags(): void {
  if (process.env.NODE_ENV === 'development') {
    console.table(getAllFeatureFlags());
  }
}
