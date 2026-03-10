import React from 'react';

/**
 * PinnedIndicator - visual indicator for objects pinned to viewport
 * Shows a purple pin icon
 */
export const PinnedIndicator: React.FC = () => {
  return (
    <div
      className="absolute -top-2 -right-2 bg-purple-600 rounded-full p-1 z-50 pointer-events-none"
      title="Pinned to screen"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <line x1="12" y1="17" x2="12" y2="22"></line>
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
      </svg>
    </div>
  );
};
