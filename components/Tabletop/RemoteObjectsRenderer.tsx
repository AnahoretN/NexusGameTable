import React, { memo } from 'react';
import { Card } from '../Card';
import { SvgTokenShape } from '../SvgTokenShape';
import { TableObject, Card as CardType, Token as TokenType, Deck as DeckType, ItemType } from '../../types';

interface RemoteObjectsRendererProps {
  remoteCursorSlotObjects: TableObject[];
  remoteDraggingObjects: TableObject[];
  v2p: (vu: number) => number;
  state: any;
  pixelsPerVU: number;
}

export const RemoteObjectsRenderer = memo<RemoteObjectsRendererProps>(({
  remoteCursorSlotObjects,
  remoteDraggingObjects,
  v2p,
  state,
  pixelsPerVU
}) => {
  const renderRemoteToken = (token: TokenType, key: string, globalZIndex: number) => (
    <div
      key={key}
      className="absolute pointer-events-none select-none"
      style={{
        left: v2p(token.x),
        top: v2p(token.y),
        width: v2p(token.width),
        height: v2p(token.height),
        transform: `rotate(${token.rotation}deg)`,
        opacity: 0.5,
        filter: 'brightness(0.6)',
        zIndex: globalZIndex,
      }}
    >
      <SvgTokenShape
        shape={token.shape}
        width={v2p(token.width)}
        height={v2p(token.height)}
        color={token.color || '#e74c3c'}
        content={token.content}
        rotation={0}
        borderWidth={token.borderWidth ?? 2}
        borderColor={(token as any).borderColor || '#ffffff'}
        opacity={token.opacity ?? 100}
        borderOpacity={token.borderOpacity ?? 100}
        showThickness={true}
        tokenName={(token as any).showNameOnToken || (token as any).showName || ((token as any).archetypeId && (state.objects[(token as any).archetypeId] as any)?.showName) ? token.name : undefined}
        fontColor={(token as any).fontColor || '#ffffff'}
        pixelsPerVU={pixelsPerVU}
      />
    </div>
  );

  const renderRemoteCard = (card: CardType, key: string, globalZIndex: number) => {
    const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;
    let baseWidth = card.width ?? (deck?.cardWidth ?? 63);
    let baseHeight = card.height ?? (deck?.cardHeight ?? 88);
    const pxWidth = v2p(baseWidth);
    const pxHeight = v2p(baseHeight);

    return (
      <div
        key={key}
        className="absolute pointer-events-none select-none"
        style={{
          left: v2p(card.x),
          top: v2p(card.y),
          width: pxWidth,
          height: pxHeight,
          transform: `rotate(${card.rotation ?? 0}rad)`,
          opacity: 0.5,
          filter: 'brightness(0.6)',
          zIndex: globalZIndex,
        }}
      >
        <Card
          card={card}
          overrideWidth={pxWidth}
          overrideHeight={pxHeight}
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

  const renderRemoteObject = (obj: TableObject, keyPrefix: string, globalZIndex: number) => {
    if (obj.type === ItemType.TOKEN) {
      return renderRemoteToken(obj as TokenType, `${keyPrefix}-${obj.id}`, globalZIndex);
    }

    if (obj.type === ItemType.CARD) {
      return renderRemoteCard(obj as CardType, `${keyPrefix}-${obj.id}`, globalZIndex);
    }

    return null;
  };

  return (
    <>
      {/* Objects in another player's cursor slot */}
      {remoteCursorSlotObjects.map(obj => renderRemoteObject(obj, 'remote-cursor', 999997))}

      {/* Objects being dragged by another player */}
      {remoteDraggingObjects.map(obj => renderRemoteObject(obj, 'remote-drag', 999999))}

      {/* Shadow objects being dragged by remote players */}
      {remoteDraggingObjects.map(obj => renderRemoteObject(obj, 'remote-drag-shadow', 999998))}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for RemoteObjectsRenderer
  return (
    prevProps.remoteCursorSlotObjects === nextProps.remoteCursorSlotObjects &&
    prevProps.remoteDraggingObjects === nextProps.remoteDraggingObjects &&
    prevProps.v2p === nextProps.v2p &&
    prevProps.state === nextProps.state
  );
});

RemoteObjectsRenderer.displayName = 'RemoteObjectsRenderer';

// Export memoized component with custom comparison
export const RemoteObjectsRendererMemo = memo(RemoteObjectsRenderer, (prevProps, nextProps) => {
  return (
    prevProps.remoteCursorSlotObjects === nextProps.remoteCursorSlotObjects &&
    prevProps.remoteDraggingObjects === nextProps.remoteDraggingObjects &&
    prevProps.v2p === nextProps.v2p &&
    prevProps.state === nextProps.state
  );
});

RemoteObjectsRendererMemo.displayName = 'RemoteObjectsRendererMemo';