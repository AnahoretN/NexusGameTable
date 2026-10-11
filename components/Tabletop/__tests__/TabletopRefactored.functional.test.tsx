/**
 * Tabletop Refactored - Smoke Tests
 *
 * Minimal smoke suite: the component mounts without errors, renders its
 * root element, and handles basic DOM events. Deep behavioral testing of
 * interactions lives in the P2P puppeteer scripts (see project docs).
 *
 * Migrated from Jest to Vitest (vi.* instead of jest.*).
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { Tabletop } from '../TabletopRefactored';

// Render as-is: every external dependency is mocked below.
const renderTabletop = () => render(<Tabletop />);

// Mock GameContext - the tabletop reads game state and dispatch through it
const mockDispatch = vi.fn();
vi.mock('../../../store/GameContext', () => ({
  useGame: () => ({
    state: {
      objects: {
        'card-1': {
          id: 'card-1',
          type: 'CARD',
          x: 100,
          y: 100,
          width: 63,
          height: 88,
          rotation: 0,
          faceUp: true,
          isOnTable: true,
        },
        'token-1': {
          id: 'token-1',
          type: 'TOKEN',
          x: 200,
          y: 200,
          width: 50,
          height: 50,
          rotation: 0,
          isOnTable: true,
        },
      },
      players: [
        { id: 'player-1', name: 'Player 1', color: '#e74c3c' },
      ],
    },
    dispatch: mockDispatch,
    isHost: true,
  }),
}));

// Mock the modular contexts with exactly the hooks the Tabletop tree imports.
// (Mounting the real providers makes the full component loop - jsdom has no
// layout engine - so the context layer gets a static stub here; the context
// layer itself is covered by ContextIntegration.test.tsx.)
vi.mock('../../../store/contexts', () => ({
  useActivePlayerId: () => 'player-1',
  useIsGM: () => true,
  useViewTransform: () => ({
    viewTransform: {
      pixelsPerVU: 1.08,
      zoom: 1,
      scroll: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
    },
    setZoom: vi.fn(),
    setScroll: vi.fn(),
    setOffset: vi.fn(),
    resetTransform: vi.fn(),
  }),
  useHyperscaleLayers: () => [],
  useLayerSelection: () => [[], vi.fn()],
  useLanguage: () => 'en',
  useIsSettingsModalOpen: () => false,
}));

// TopLeftToolPanel imports useLanguage directly from UIContext, bypassing
// the barrel - mock that path too.
vi.mock('../../../store/contexts/UIContext', () => ({
  useLanguage: () => 'en',
}));

// Mock the sub-component/hook barrel. The full child renderer tree OOMs in
// jsdom (infinite resize/layout effects), and the smoke target here is the
// TabletopRefactored component itself - its root element, providers wiring
// and inline event handlers.
vi.mock('../index', () => {
  const noop = () => null;
  return {
    useTabletopPositioning: () => ({
      pixelsPerVU: 1.08,
      basePixelsPerVU: 1.08,
      v2p: (vu: number) => vu * 1.08,
      p2v: (px: number) => px / 1.08,
      zoomMultiplier: 1,
    }),
    useLayerZoom: () => ({
      getLayerZoomScale: () => 1,
      getLayerInverseScale: () => 1,
    }),
    usePositionedStyle: () => ({
      createPositionedStyle: () => ({}),
    }),
    useWorldBounds: () => ({ width: 1000, height: 1000 }),
    useObjectFilters: () => ({
      visibleTableObjects: [],
      remoteCursorSlotObjects: [],
      remoteDraggingObjects: [],
      pinnedUIObjects: [],
      unpinnedUIObjects: [],
      pinnedDecks: [],
      unpinnedDecks: [],
      pinnedGameObjects: [],
    }),
    useTabletopEventHandlers: () => ({
      handleContextMenu: vi.fn(),
      handlePileContextMenu: vi.fn(),
      handleMouseDown: vi.fn(),
      handleDoubleClick: vi.fn(),
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
      handleWheel: vi.fn(),
      handleResizeStart: vi.fn(),
      handleAddNexusCell: vi.fn(),
    }),
    useTokenArchetype: () => {},
    TabletopBackground: noop,
    RemoteObjectsRenderer: noop,
    GameObjectsRenderer: noop,
    UIObjectsRenderer: noop,
    PinnedGameObjectsRenderer: noop,
    TabletopCursorSlot: noop,
    TabletopModals: noop,
    TopLeftToolPanel: noop,
  };
});

vi.mock('../../../hooks/useLocalSettings', () => ({
  useLocalSettings: () => ({
    settings: { zoom: 100 },
    updateSetting: vi.fn(),
  }),
}));

vi.mock('../../../store/dragOverState', () => ({
  useDragOverStore: () => ({
    setDraggingOver: vi.fn(),
    clearDraggingOver: vi.fn(),
  }),
}));

vi.mock('../../../contexts/ToolSettingsContext', () => {
  const useToolSettings = () => ({
    settings: {
      selectedTool: 'select',
      cursor: {},
      marker: {},
      eraser: {},
      ruler: { step: 1 },
      zoom: { level: 100 },
      grid: { enabled: false, cellSizeVU: 50 },
      text: {
        defaultFontSizeVU: 10,
        fontColor: '#000000',
        borderColor: '#000000',
        borderWidth: 1,
      },
    },
    setSelectedTool: vi.fn(),
    updateCursorSettings: vi.fn(),
    updateMarkerSettings: vi.fn(),
    updateEraserSettings: vi.fn(),
    updateRulerSettings: vi.fn(),
    updateZoomSettings: vi.fn(),
    updateTextSettings: vi.fn(),
    updateGridSettings: vi.fn(),
  });

  // Legacy hooks read from useToolSettings, same as the real module
  return {
    useToolSettings,
    useDrawingTool: () => useToolSettings().settings.selectedTool,
    useCursorSettings: () => useToolSettings().settings.cursor,
    useMarkerSettings: () => useToolSettings().settings.marker,
    useEraserSettings: () => useToolSettings().settings.eraser,
    useRulerSettings: () => useToolSettings().settings.ruler,
    useTextSettings: () => useToolSettings().settings.text,
    useGridSettings: () => useToolSettings().settings.grid,
  };
});

describe('Tabletop Refactored - Smoke Tests', () => {
  test('renders root tabletop element without errors', () => {
    const { container } = renderTabletop();

    expect(container.querySelector('[data-tabletop="true"]')).toBeInTheDocument();
  });

  test('prevents the default browser context menu', () => {
    const { container } = renderTabletop();

    const tabletopElement = container.querySelector('[data-tabletop="true"]');
    expect(tabletopElement).toBeInTheDocument();

    const contextMenuEvent = new Event('contextmenu', {
      bubbles: true,
      cancelable: true,
    });

    let wasPrevented = false;
    contextMenuEvent.preventDefault = () => {
      wasPrevented = true;
    };

    tabletopElement!.dispatchEvent(contextMenuEvent);

    expect(wasPrevented).toBe(true);
  });

  test('survives a full mouse interaction sequence', () => {
    const { container } = renderTabletop();

    const tabletopElement = container.querySelector('[data-tabletop="true"]');
    expect(tabletopElement).toBeInTheDocument();

    fireEvent.mouseDown(tabletopElement!, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(tabletopElement!, { clientX: 150, clientY: 150 });
    fireEvent.mouseUp(tabletopElement!, { clientX: 150, clientY: 150 });

    // No assertion beyond "did not throw" - this is a crash guard
    expect(tabletopElement).toBeInTheDocument();
  });

  test('survives window keyboard events and unmount', () => {
    const { unmount } = renderTabletop();

    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.keyDown(window, { key: 'Control' });
    fireEvent.keyUp(window, { key: 'Shift' });
    fireEvent.keyUp(window, { key: 'Control' });

    expect(() => unmount()).not.toThrow();
  });
});
