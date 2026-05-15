import React, { useEffect, useState } from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, CardShape, Deck as DeckType, Randomizer, Counter, DiceObject, TokenShape, Board as BoardType, BattlefieldCell, NexusBoard, NexusCellObject, Drawing, EffectTemplate, TableObject } from '../types';
import { Card } from './Card';
import { SvgTokenShape } from './SvgTokenShape';
import { SvgDeckShape, DeckLabel, shouldUseSvgForDeck } from './SvgDeckShape';
import { Layers, Pencil } from 'lucide-react';
import { DECK_OFFSET } from '../constants';
import { logger } from '../utils/logger';
import { getCardShapeStyles } from '../utils/shapeUtils';
import { getTokenWithAppliedState } from '../hooks/useTokenWithState';

// Global image cache for Effect Templates to prevent reloading
const effectImageCache = new Map<string, HTMLImageElement>();
const preloadPromises = new Map<string, Promise<void>>();

/**
 * Preload an Effect Template image and cache it
 */
function preloadEffectImage(src: string): Promise<void> {
  if (effectImageCache.has(src)) {
    return Promise.resolve();
  }

  if (preloadPromises.has(src)) {
    return preloadPromises.get(src)!;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      effectImageCache.set(src, img);
      resolve();
    };
    img.onerror = () => {
      // Still cache on error to prevent repeated failed requests
      effectImageCache.set(src, img);
      resolve(); // Don't reject - allow render to continue
    };
    img.src = src;
  });

  preloadPromises.set(src, promise);
  return promise;
}

interface CursorSlotItemProps {
  item: CardType | TokenType | DeckType | Randomizer | Counter | DiceObject | BoardType | BattlefieldCell | NexusBoard | NexusCellObject | Drawing | EffectTemplate;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  zIndex: number;
  state: { objects: Record<string, any> };
}

/**
 * Renders a card in the cursor slot
 */
const CursorSlotCard: React.FC<CursorSlotItemProps & { item: CardType }> = ({ item, width, height, offsetX, offsetY, zIndex, state }) => {
  const deck = item.deckId ? state.objects[item.deckId] as DeckType | undefined : undefined;
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Card
        card={item}
        overrideWidth={width}
        overrideHeight={height}
        cardWidth={deck?.cardWidth}
        cardHeight={deck?.cardHeight}
        cardOrientation={deck?.cardOrientation}
        cardNamePosition={deck?.cardNamePosition}
        disableRotationTransform={true}
        disablePointerEvents={true}
        showActionButtons={false}
        skipTooltip={true}
        deckSpriteConfig={deck?.spriteConfig}
        deckShowTooltipImage={deck?.showTooltipImage}
        deckTooltipScale={deck?.tooltipScale}
      />
    </div>
  );
};

/**
 * Renders a token in the cursor slot
 */
const CursorSlotToken: React.FC<CursorSlotItemProps & { item: TokenType }> = ({ item, width, height, offsetX, offsetY, zIndex, state }) => {
  // Apply token state to get correct visual properties
  const tokenWithState = getTokenWithAppliedState(item, state.objects as Record<string, TableObject>);
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgTokenShape
        shape={tokenWithState.shape}
        width={width}
        height={height}
        color={tokenWithState.color || '#34495e'}
        content={tokenWithState.content}
        rotation={0}
        borderWidth={tokenWithState.borderWidth ?? 3}
        borderColor={(tokenWithState as any).borderColor || 'white'}
        opacity={tokenWithState.opacity ?? 100}
        borderOpacity={(tokenWithState as any).borderOpacity ?? 100}
        showThickness={true}
        tokenName={(tokenWithState as any).showName || ((tokenWithState as any).archetypeId && (state.objects[(tokenWithState as any).archetypeId] as any)?.showName) ? item.name : undefined}
        fontColor={(tokenWithState as any).fontColor || 'white'}
      />
    </div>
  );
};

/**
 * Renders a deck in the cursor slot
 */
const CursorSlotDeck: React.FC<CursorSlotItemProps & { item: DeckType }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  const cardShape = item.cardShape ?? CardShape.POKER;
  const cardOrientation = item.cardOrientation ?? CardOrientation.VERTICAL;
  const cardIds = item.cardIds || [];
  const visibleCardCount = cardIds.length;
  const totalCardCount = (item.baseCardIds || cardIds).length;
  const shapeStyles = getCardShapeStyles(cardShape, cardOrientation);
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Inner wrapper with fixed size - prevents expansion to container */}
      <div
        style={{
          position: 'relative',
          width: `${width}px`,
          height: `${height}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {shouldUseSvgForDeck(cardShape) ? (
          <>
            {[2, 1, 0].map(i => (
              <div
                key={i}
                className="absolute pointer-events-none"
                style={{
                  width: `${width}px`,
                  height: `${height}px`,
                  top: 0,
                  left: 0,
                  transform: `translate(${i * DECK_OFFSET}px, ${i * DECK_OFFSET}px)`,
                  zIndex: -i,
                }}
              >
                <SvgDeckShape
                  shape={cardShape}
                  width={width}
                  height={height}
                  backgroundColor="#1e293b"
                  borderColor="#475569"
                  borderWidth={2}
                  orientation={cardOrientation}
                />
              </div>
            ))}
            <div className="absolute inset-0">
              <SvgDeckShape
                shape={cardShape}
                width={width}
                height={height}
                backgroundColor="#0f172a"
                borderColor={item.locked ? "#dc2626" : "#64748b"}
                borderWidth={2}
                orientation={cardOrientation}
              >
                <Layers className="text-slate-400 mb-1" size={shouldUseSvgForDeck(cardShape) ? 12 : 16} />
                <DeckLabel
                  name={item.name}
                  count={visibleCardCount}
                  totalCount={totalCardCount}
                  shape={cardShape}
                />
              </SvgDeckShape>
            </div>
          </>
        ) : (
          <>
            {[2, 1, 0].map(i => (
              <div
                key={i}
                className="absolute bg-slate-800 border-2 border-slate-600 shadow-md pointer-events-none"
                style={{
                  width: `${width}px`,
                  height: `${height}px`,
                  top: 0,
                  left: 0,
                  transform: `translate(${i * DECK_OFFSET}px, ${i * DECK_OFFSET}px)`,
                  zIndex: -i,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                  ...shapeStyles
                }}
              />
            ))}
            <div className="absolute inset-0 bg-slate-900 border-2 border-slate-500 flex flex-col items-center justify-center" style={shapeStyles}>
              <Layers className="text-slate-400 mb-2" size={24} />
              <span className="text-xs text-slate-300 font-bold px-2 text-center select-none drop-shadow-md">{item.name}</span>
              <span className="text-xs text-slate-500 select-none drop-shadow-md">{visibleCardCount} / {totalCardCount}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Renders a randomizer in the cursor slot
 */
const CursorSlotRandomizer: React.FC<CursorSlotItemProps & { item: Randomizer }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;

  return (
    <div
      className="bg-gradient-to-br from-purple-900 to-purple-700 border-2 border-purple-400 rounded-full shadow-lg flex items-center justify-center"
      style={{
        position: 'absolute',
        left: -width * 0.1, // Center object in the larger container
        top: -height * 0.1,
        transform: `translate(${offsetX}px, ${offsetY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
      }}
    >
      <div className="text-white text-sm font-bold px-2 text-center leading-tight">{item.currentValue || item.name || '?'}</div>
    </div>
  );
};

/**
 * Renders a counter in the cursor slot
 */
const CursorSlotCounter: React.FC<CursorSlotItemProps & { item: Counter }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="bg-slate-900 border-2 border-slate-600 shadow-xl flex items-center justify-between p-2 gap-2 text-white"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: '5px',
        }}
      >
          <div className="text-white text-sm font-bold">➖</div>
        <div className="text-white text-xl font-bold">{item.value}</div>
        <div className="text-white text-sm font-bold">➕</div>
      </div>
    </div>
  );
};

/**
 * Renders a dice in the cursor slot
 */
const CursorSlotDice: React.FC<CursorSlotItemProps & { item: DiceObject }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  const diceShape = item.shape || TokenShape.SQUARE;
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgTokenShape
        shape={diceShape}
        width={width}
        height={height}
        color={item.color || '#e74c3c'}
        content={String(item.currentValue || 1)}
        rotation={0}
        borderWidth={item.borderWidth ?? 2}
        borderColor={item.borderColor || 'white'}
        opacity={item.opacity ?? 100}
        borderOpacity={item.borderOpacity ?? 100}
        showThickness={true}
        fontColor={item.fontColor || 'white'}
      />
    </div>
  );
};

/**
 * Renders a board in the cursor slot
 */
const CursorSlotBoard: React.FC<CursorSlotItemProps & { item: BoardType }> = ({ item, width, height, offsetX, offsetY, zIndex, state: _state }) => {
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="flex items-center justify-center text-white font-bold select-none"
        style={{
          width: '100%',
          height: '100%',
          border: '2px solid #212f3c',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          backgroundColor: item.color || '#34495e',
          backgroundImage: item.content ? `url(${item.content})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: '5px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Board name label */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-black/70 text-white px-2 py-1 rounded text-xs whitespace-nowrap">
          {item.name}
        </div>
      </div>
    </div>
  );
};

/**
 * Renders a battlefield cell in the cursor slot
 */
const CursorSlotBattlefieldCell: React.FC<CursorSlotItemProps & { item: BattlefieldCell }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgTokenShape
        shape={item.shape}
        width={width}
        height={height}
        color={item.color || '#2c3e50'}
        content={item.content}
        rotation={0}
        borderWidth={item.borderWidth ?? 2}
        borderColor={item.borderColor || '#3498db'}
        opacity={item.opacity ?? 100}
        borderOpacity={item.borderOpacity ?? 100}
        showThickness={true}
        tokenName={item.name}
      />
    </div>
  );
};

/**
 * Renders a Nexus board in the cursor slot (simplified representation)
 */
const CursorSlotNexusBoard: React.FC<CursorSlotItemProps & { item: NexusBoard }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  const cellCount = item.cells?.length || 1;
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        {/* Main hex cell */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
          }}
        >
          <SvgTokenShape
            shape={TokenShape.HEX}
            width={width}
            height={height}
            color={item.color || '#8e44ad'}
            content=""
            rotation={0}
            borderWidth={2}
            borderColor="#9b59b6"
            opacity={100}
            borderOpacity={100}
            showThickness={false}
          />
        </div>
        {/* Cell count badge */}
        {cellCount > 1 && (
          <div
            className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
            style={{ minWidth: '20px', minHeight: '20px' }}
          >
            {cellCount}
          </div>
        )}
        {/* Board name label */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/70 text-white px-2 py-0.5 rounded text-xs whitespace-nowrap">
          {item.name}
        </div>
      </div>
    </div>
  );
};

/**
 * Renders a Nexus cell in the cursor slot
 */
const CursorSlotNexusCell: React.FC<CursorSlotItemProps & { item: NexusCellObject }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgTokenShape
        shape={TokenShape.HEX}
        width={width}
        height={height}
        color={item.color || '#8e44ad'}
        content=""
        rotation={0}
        borderWidth={2}
        borderColor="#9b59b6"
        opacity={item.opacity ?? 100}
        borderOpacity={item.borderOpacity ?? 100}
        showThickness={false}
      />
    </div>
  );
};

/**
 * Renders a drawing in the cursor slot (simplified representation)
 */
const CursorSlotDrawing: React.FC<CursorSlotItemProps & { item: Drawing }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  const strokeCount = item.strokes?.length || 0;
  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = width * 1.2;
  const containerHeight = height * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - width) / 2;
  const paddingY = (containerHeight - height) / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="bg-white/10 border-2 border-dashed border-white/30 rounded-lg flex flex-col items-center justify-center backdrop-blur-sm"
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        <Pencil size={Math.min(width, height) * 0.3} className="text-white/70 mb-1" />
        {strokeCount > 0 && (
          <span className="text-white/70 text-xs">{strokeCount} strokes</span>
        )}
      </div>
    </div>
  );
};

/**
 * Renders an effect template in the cursor slot
 * Shows the template with proper rotation and pivot, just like on the tabletop
 */
const CursorSlotEffectTemplate: React.FC<CursorSlotItemProps & { item: EffectTemplate }> = ({ item, width, height, offsetX, offsetY, zIndex }) => {
  const pivot = item.pivot || { x: 50, y: 50 };
  const rotation = item.rotation || 0;
  const [isImageReady, setIsImageReady] = useState(false);

  // Ensure width/height are never zero to prevent black square flicker
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);

  // Increase container size by 20% to prevent clipping during fast movement
  const containerWidth = safeWidth * 1.2;
  const containerHeight = safeHeight * 1.2;
  // Calculate padding to center the object
  const paddingX = (containerWidth - safeWidth) / 2;
  const paddingY = (containerHeight - safeHeight) / 2;

  // Preload image when component mounts
  useEffect(() => {
    if (item.content) {
      // Check if already cached
      if (effectImageCache.has(item.content)) {
        setIsImageReady(true);
        return;
      }

      // Preload and show when ready
      preloadEffectImage(item.content).then(() => {
        setIsImageReady(true);
      });
    }
  }, [item.content]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${offsetX - paddingX}px, ${offsetY - paddingY}px)`,
        width: `${containerWidth}px`,
        height: `${containerHeight}px`,
        zIndex,
        pointerEvents: 'none',
        willChange: 'transform',
        backfaceVisibility: 'hidden' as 'hidden',
        overflow: 'visible',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Rotated image wrapper with fixed size - matches EffectTemplateRenderer */}
      <div
        style={{
          position: 'relative',
          width: `${safeWidth}px`,
          height: `${safeHeight}px`,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${pivot.x}% ${pivot.y}%`,
          backfaceVisibility: 'hidden' as 'hidden',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        {/* Effect image - use 100% with objectFit: 'fill' to match EffectTemplateRenderer */}
        <img
          src={item.content}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill', // Match EffectTemplateRenderer - allow stretching
            opacity: isImageReady
              ? (item.opacity !== undefined ? item.opacity / 100 : 1)
              : 0,
            pointerEvents: 'none',
            userSelect: 'none',
            display: 'block',
            backgroundColor: 'transparent',
            transition: 'opacity 0.05s ease-out',
          }}
          draggable={false}
          onLoad={() => setIsImageReady(true)}
          onError={(e) => {
            // Fallback on CORS error - hide the image but keep layout
            (e.target as HTMLImageElement).style.opacity = '0';
            setIsImageReady(true); // Still mark as ready to prevent infinite loading
          }}
        />

        {/* Small pivot indicator for visual reference */}
        <div
          style={{
            position: 'absolute',
            left: `${pivot.x}%`,
            top: `${pivot.y}%`,
            width: '8px',
            height: '8px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            backgroundColor: 'rgba(147, 51, 234, 0.6)',
            border: '1px solid white',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

/**
 * Main renderer for cursor slot items
 * Dispatches to the appropriate component based on item type
 */
export const renderCursorSlotItem = (props: CursorSlotItemProps, key: string) => {
  const { item } = props;

  switch (item.type) {
    case ItemType.CARD:
      return <CursorSlotCard key={key} {...props} item={item as CardType} />;

    case ItemType.TOKEN:
      return <CursorSlotToken key={key} {...props} item={item as TokenType} />;

    case ItemType.DECK:
      return <CursorSlotDeck key={key} {...props} item={item as DeckType} />;

    case ItemType.RANDOMIZER:
      return <CursorSlotRandomizer key={key} {...props} item={item as Randomizer} />;

    case ItemType.COUNTER:
      return <CursorSlotCounter key={key} {...props} item={item as Counter} />;

    case ItemType.DICE_OBJECT:
      return <CursorSlotDice key={key} {...props} item={item as DiceObject} />;

    case ItemType.BOARD:
      return <CursorSlotBoard key={key} {...props} item={item as BoardType} />;

    case ItemType.BATTLEFIELD_CELL:
      return <CursorSlotBattlefieldCell key={key} {...props} item={item as BattlefieldCell} />;

    case ItemType.NEXUS_BOARD:
      return <CursorSlotNexusBoard key={key} {...props} item={item as NexusBoard} />;

    case ItemType.NEXUS_CELL:
      return <CursorSlotNexusCell key={key} {...props} item={item as NexusCellObject} />;

    case ItemType.DRAWING:
      return <CursorSlotDrawing key={key} {...props} item={item as Drawing} />;

    case ItemType.EFFECT_TEMPLATE:
      return <CursorSlotEffectTemplate key={key} {...props} item={item as EffectTemplate} />;

    default:
      logger.warn('[renderCursorSlotItem] Unknown item type:', (item as any).type);
      return null;
  }
};
