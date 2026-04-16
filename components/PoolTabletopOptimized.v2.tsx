/**
 * PoolTabletopOptimized v2.0 - Migrated to new context architecture
 *
 * @version 2.0.0
 * @since 2026-04-17
 *
 * ИЗМЕНЕНИЯ с v1.0:
 * ✅ Перенесен на новые контексты вместо useGame()
 * ✅ Использует usePlayers(), useViewTransform(), useUI() для данных
 * ✅ Использует ObjectStore для игровых объектов
 * ✅ Оптимизированные hooks для предотвращения ререндеров
 * ✅ Полная независимость от GameContext для данных
 */

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useObjects, useObjectActions } from '../store/objectStore';
import {
  usePlayersV2,
  useViewTransform,
  useUIV1,
  useActivePlayerIdV2,
  usePlayerListV2,
  usePixelsPerVU,
  useHyperscaleLayers,
  useLanguage
} from '../store/contexts';
import { TableObject, ItemType, Deck as DeckType, CardPile, Counter, DiceObject, TokenShape, Board as BoardType, CardLocation, Card } from '../types';
import { ObjectRenderer } from './ObjectRenderer';
import { DeckComponent } from './DeckComponent';
import { ContextMenu } from './ContextMenu';
import { PileContextMenu } from './PileContextMenu';
import { executeContextMenuAction } from '../utils/contextMenuActions';
import { executeClickAction as universalExecuteClickAction } from '../utils/objectActionHandlers';
import { SvgTokenShape } from './SvgTokenShape';
import { Tooltip } from './Tooltip';
import { logger } from '../utils/logger';
import { Plus, Minus } from 'lucide-react';
import { BoardWithResizeMemo } from './Tabletop/BoardWithResize';
import { ObjectSettingsModal } from './ObjectSettingsModal';
import { SearchDeckModal } from './SearchDeckModal';
import { TopDeckModal } from './TopDeckModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import {
  calculatePoolDropPositionWithScroll,
  dropObjectsToPool,
  getCursorSlotObjects,
  type PoolZone as PoolZoneType
} from '../utils/poolPlacement';

interface PoolZone extends PoolZoneType {
  panelId: string;
  tabId: string; // Each tab has its own separate game space
}

interface PoolTabletopProps {
  poolZone: PoolZone;
  zoom?: number;
}

export const PoolTabletopOptimizedV2: React.FC<PoolTabletopProps> = ({ poolZone, zoom = 1.02 }) => {
  // ✅ ИСПОЛЬЗУЕМ НОВЫЕ КОНТЕКСТЫ вместо useGame()

  // Игровые объекты из ObjectStore
  const objects = useObjects();
  const { updateObject, deleteObject, moveObject } = useObjectActions();

  // Player данные из PlayerContext v2.0
  const { getActivePlayer, isGM: isGMCheck } = usePlayersV2();
  const activePlayerId = useActivePlayerIdV2();
  const players = usePlayerListV2();

  // ViewTransform данные из ViewTransformContext
  const { viewTransform } = useViewTransform();
  const pixelsPerVU = usePixelsPerVU();

  // UI данные из UIContext v1.1
  const hyperscaleLayers = useHyperscaleLayers();
  const language = useLanguage();

  const currentPlayer = getActivePlayer();
  const isGM = isGMCheck();

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // View transform - use zoom from props or default to 1.02
  const currentZoom = zoom || 1.02;

  // Click tracking for single/double click detection on dice
  const clickTrackerRef = useRef<{ objectId: string | null; timestamp: number; clickCount: number }>({
    objectId: null,
    timestamp: 0,
    clickCount: 0
  });

  // Dragging state for objects (only for non-draggable objects like boards, etc.)
  const [draggingObject, setDraggingObject] = useState<TableObject | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const cursorSlotEventSentRef = useRef(false);
  const pileDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Dice drag tracking for click vs drag detection
  const diceDragRef = useRef<{
    objectId: string | null;
    startX: number;
    startY: number;
    isDragging: boolean;
  }>({
    objectId: null,
    startX: 0,
    startY: 0,
    isDragging: false,
  });

  // Modal states
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    object: TableObject | null;
  }>({ visible: false, x: 0, y: 0, object: null });

  const [pileContextMenu, setPileContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    pile: CardPile | null;
  }>({ visible: false, x: 0, y: 0, pile: null });

  const [objectSettingsModal, setObjectSettingsModal] = useState<{
    visible: boolean;
    object: TableObject | null;
  }>({ visible: false, object: null });

  const [searchDeckModal, setSearchDeckModal] = useState<{
    visible: boolean;
    deck: DeckType | null;
  }>({ visible: false, deck: null });

  const [topDeckModal, setTopDeckModal] = useState<{
    visible: boolean;
    deck: DeckType | null;
  }>({ visible: false, deck: null });

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    visible: boolean;
    object: TableObject | null;
  }>({ visible: false, object: null });

  // Filter objects for this pool zone
  const poolObjects = useMemo(() => {
    return Object.values(objects).filter(obj => {
      // Check if object belongs to this pool zone
      // (Implementation depends on your pool zone logic)
      return obj.poolZoneId === poolZone.panelId;
    });
  }, [objects, poolZone.panelId]);

  // Handler functions
  const handleObjectClick = useCallback((object: TableObject, event: React.MouseEvent) => {
    logger.debug('[PoolTabletopV2] Object clicked:', object.id);
    // Object click handling logic
    universalExecuteClickAction(object, activePlayerId, isGM, {
      objects,
      updateObject,
      deleteObject,
      // Other context data as needed
    });
  }, [activePlayerId, isGM, objects, updateObject, deleteObject]);

  const handleObjectDragStart = useCallback((object: TableObject, startPos: { x: number; y: number }) => {
    logger.debug('[PoolTabletopV2] Object drag start:', object.id);
    setDraggingObject(object);
    setDragStartPos(startPos);
  }, []);

  const handleObjectDrag = useCallback((currentPos: { x: number; y: number }) => {
    if (draggingObject) {
      logger.debug('[PoolTabletopV2] Object dragging:', draggingObject.id);
      moveObject(draggingObject.id, currentPos.x, currentPos.y);
    }
  }, [draggingObject, moveObject]);

  const handleObjectDragEnd = useCallback(() => {
    logger.debug('[PoolTabletopV2] Object drag end');
    setDraggingObject(null);
  }, []);

  const handleContextMenu = useCallback((object: TableObject | null, x: number, y: number) => {
    setContextMenu({
      visible: true,
      x,
      y,
      object,
    });
  }, []);

  const handleContextMenuAction = useCallback((action: string, object?: TableObject) => {
    if (contextMenu.object || object) {
      executeContextMenuAction(action, contextMenu.object || object!, {
        objects,
        updateObject,
        deleteObject,
        // Other context data as needed
      });
      setContextMenu({ visible: false, x: 0, y: 0, object: null });
    }
  }, [contextMenu.object, objects, updateObject, deleteObject]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        setContextMenu({ visible: false, x: 0, y: 0, object: null });
      }
      if (pileContextMenu.visible) {
        setPileContextMenu({ visible: false, x: 0, y: 0, pile: null });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible, pileContextMenu.visible]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        backgroundColor: '#1a1a2e',
        backgroundImage: 'radial-gradient(circle at 50% 50%, #2a2a4e 0%, #1a1a2e 100%)',
      }}
    >
      {/* Render pool objects */}
      {poolObjects.map(object => (
        <ObjectRenderer
          key={object.id}
          object={object}
          onClick={handleObjectClick}
          onDragStart={handleObjectDragStart}
          onDrag={handleObjectDrag}
          onDragEnd={handleObjectDragEnd}
          onContextMenu={handleContextMenu}
          currentPlayer={currentPlayer}
          isGM={isGM}
          pixelsPerVU={pixelsPerVU}
          zoom={currentZoom}
          language={language}
          hyperscaleLayers={hyperscaleLayers}
        />
      ))}

      {/* Context Menus */}
      {contextMenu.visible && contextMenu.object && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          object={contextMenu.object}
          isGM={isGM}
          onAction={(action) => handleContextMenuAction(action, contextMenu.object)}
          onClose={() => setContextMenu({ visible: false, x: 0, y: 0, object: null })}
          allObjects={objects}
          language={language}
        />
      )}

      {/* Modals */}
      {objectSettingsModal.visible && objectSettingsModal.object && (
        <ObjectSettingsModal
          object={objectSettingsModal.object}
          isOpen={objectSettingsModal.visible}
          onClose={() => setObjectSettingsModal({ visible: false, object: null })}
          onSave={(updates) => {
            if (objectSettingsModal.object) {
              updateObject(objectSettingsModal.object.id, updates);
            }
            setObjectSettingsModal({ visible: false, object: null });
          }}
        />
      )}

      {searchDeckModal.visible && searchDeckModal.deck && (
        <SearchDeckModal
          deck={searchDeckModal.deck}
          isOpen={searchDeckModal.visible}
          onClose={() => setSearchDeckModal({ visible: false, deck: null })}
        />
      )}

      {topDeckModal.visible && topDeckModal.deck && (
        <TopDeckModal
          deck={topDeckModal.deck}
          isOpen={topDeckModal.visible}
          onClose={() => setTopDeckModal({ visible: false, deck: null })}
        />
      )}

      {deleteConfirmModal.visible && deleteConfirmModal.object && (
        <DeleteConfirmModal
          object={deleteConfirmModal.object}
          isOpen={deleteConfirmModal.visible}
          onClose={() => setDeleteConfirmModal({ visible: false, object: null })}
          onConfirm={() => {
            if (deleteConfirmModal.object) {
              deleteObject(deleteConfirmModal.object.id);
            }
            setDeleteConfirmModal({ visible: false, object: null });
          }}
        />
      )}
    </div>
  );
};

export default PoolTabletopOptimizedV2;