import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ItemType, Card as CardType, Token as TokenType, CardOrientation, Deck as DeckType, TableObject } from '../types';
import { Card } from './Card';
import { SvgTokenShape } from './SvgTokenShape';

interface AnimatingObject {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTime: number;
  duration: number;
  fromRotation: number;
  toRotation: number;
}

interface RemoteObjectAnimationProps {
  animatingObjects: AnimatingObject[];
  state: { objects: Record<string, any> };
  zoom: number;
  getCardSettings: (card: CardType) => {
    cardWidth?: number;
    cardHeight?: number;
    cardOrientation?: CardOrientation;
  };
}

/**
 * Hook to track and manage remote object position animations
 */
export function useRemoteObjectAnimation(
  objects: Record<string, TableObject>,
  localDraggingId: string | null,
  animationDuration: number = 400
) {
  const [animatingObjects, setAnimatingObjects] = useState<AnimatingObject[]>([]);
  const previousObjectsRef = useRef<Record<string, TableObject>>({});
  const animationFrameRef = useRef<number>();
  const lastUpdateRef = useRef<number>(0);

  // Get set of object IDs that are currently being animated (for filtering)
  const getAnimatingIds = useCallback(() => {
    return new Set(animatingObjects.map(a => a.id));
  }, [animatingObjects]);

  // Track object position changes
  useEffect(() => {
    const now = performance.now();
    // Throttle updates to avoid excessive re-renders
    if (now - lastUpdateRef.current < 30) return;
    lastUpdateRef.current = now;

    const currentObjects = objects;
    const previousObjects = previousObjectsRef.current;
    const newAnimations: AnimatingObject[] = [];
    const animatingIds = new Set(animatingObjects.map(a => a.id));

    Object.entries(currentObjects).forEach(([id, obj]) => {
      const prevObj = previousObjects[id];

      // Skip if: no previous state, object just created, or currently being dragged locally
      if (!prevObj) return;
      if ((obj as any).inCursorSlot) return;
      if (id === localDraggingId) return;
      if (!(obj as any).isOnTable && !(prevObj as any).isOnTable) return;

      // Check if position changed significantly (more than 1px)
      const positionChanged =
        Math.abs((obj.x ?? 0) - (prevObj.x ?? 0)) > 1 ||
        Math.abs((obj.y ?? 0) - (prevObj.y ?? 0)) > 1;

      // Check if rotation changed
      const rotationChanged = Math.abs((obj.rotation ?? 0) - (prevObj.rotation ?? 0)) > 1;

      // Only animate if not currently animating this object
      if ((positionChanged || rotationChanged) && !animatingIds.has(id)) {
        // Don't animate objects that are transitioning between visibility states
        const card = obj as any;
        const prevCard = prevObj as any;
        const visibilityChanged = (obj as any).isOnTable !== (prevObj as any).isOnTable ||
          (card.location !== undefined && prevCard.location !== undefined && card.location !== prevCard.location);

        if (!visibilityChanged) {
          newAnimations.push({
            id,
            fromX: prevObj.x ?? 0,
            fromY: prevObj.y ?? 0,
            toX: obj.x ?? 0,
            toY: obj.y ?? 0,
            startTime: performance.now(),
            duration: animationDuration,
            fromRotation: prevObj.rotation ?? 0,
            toRotation: obj.rotation ?? 0,
          });
        }
      }
    });

    if (newAnimations.length > 0) {
      setAnimatingObjects(prev => [...prev, ...newAnimations]);
    }

    // Update previous objects ref
    const timeoutId = setTimeout(() => {
      previousObjectsRef.current = Object.entries(currentObjects).reduce((acc, [id, obj]) => {
        acc[id] = { ...obj };
        return acc;
      }, {} as Record<string, TableObject>);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [objects, localDraggingId, animationDuration]);

  // Animation loop
  useEffect(() => {
    if (animatingObjects.length === 0) return;

    const animate = (currentTime: number) => {
      setAnimatingObjects(prev => {
        const stillAnimating: AnimatingObject[] = [];

        for (const anim of prev) {
          const elapsed = currentTime - anim.startTime;
          const progress = Math.min(elapsed / anim.duration, 1);

          // Easing function (ease-out cubic)
          const easeProgress = 1 - Math.pow(1 - progress, 3);

          if (progress < 1) {
            stillAnimating.push({
              ...anim,
              // Update from position for smooth multi-step animations
              fromX: anim.fromX + (anim.toX - anim.fromX) * easeProgress,
              fromY: anim.fromY + (anim.toY - anim.fromY) * easeProgress,
            });
          }
        }

        if (stillAnimating.length > 0) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }

        return stillAnimating;
      });
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animatingObjects]);

  return {
    animatingObjects,
    getAnimatingIds,
  };
}

/**
 * RemoteObjectAnimation - renders smooth position transitions for objects moved by remote players
 */
export const RemoteObjectAnimation: React.FC<RemoteObjectAnimationProps> = ({
  animatingObjects,
  state,
  zoom,
  getCardSettings,
}) => {
  // Handle undefined animatingObjects during initialization
  if (!animatingObjects || animatingObjects.length === 0) return null;

  const currentTime = performance.now();

  return (
    <>
      {animatingObjects.map(anim => {
        const progress = Math.min((currentTime - anim.startTime) / anim.duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentX = anim.fromX + (anim.toX - anim.fromX) * easeProgress;
        const currentY = anim.fromY + (anim.toY - anim.fromY) * easeProgress;
        const currentRotation = anim.fromRotation + (anim.toRotation - anim.fromRotation) * easeProgress;

        // Get the current object state for rendering
        const obj = state.objects[anim.id];
        if (!obj) return null;

        const isCard = obj.type === ItemType.CARD;
        const isToken = obj.type === ItemType.TOKEN;

        if (isCard) {
          const card = obj as CardType;
          const deck = card.deckId ? state.objects[card.deckId] as DeckType | undefined : undefined;

          let baseWidth = card.width ?? (deck?.cardWidth ?? 63);
          let baseHeight = card.height ?? (deck?.cardHeight ?? 88);
          let isHorizontal = deck?.cardOrientation === CardOrientation.HORIZONTAL;

          if (deck?.cardShape) {
            baseWidth = card.width ?? deck.cardWidth ?? 63;
            baseHeight = card.height ?? deck.cardHeight ?? 88;
          }

          const width = baseWidth * zoom;
          const height = baseHeight * zoom;

          return (
            <div
              key={`anim-${anim.id}-${anim.startTime}`}
              className="absolute pointer-events-none"
              style={{
                left: `${currentX + width / 2}px`,
                top: `${currentY + height / 2}px`,
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate(-50%, -50%) rotate(${currentRotation}rad)`,
                zIndex: (obj.zIndex ?? 0) + 1000,
              }}
            >
              <Card
                card={card}
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
        }

        if (isToken) {
          const token = obj as TokenType;

          const baseWidth = token.width ?? 50;
          const baseHeight = token.height ?? 50;
          const width = baseWidth * zoom;
          const height = baseHeight * zoom;

          return (
            <div
              key={`anim-${anim.id}-${anim.startTime}`}
              className="absolute pointer-events-none"
              style={{
                left: `${currentX + width / 2}px`,
                top: `${currentY + height / 2}px`,
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate(-50%, -50%) rotate(${currentRotation}rad)`,
                zIndex: (obj.zIndex ?? 0) + 1000,
              }}
            >
              <SvgTokenShape
                shape={token.shape}
                width={width}
                height={height}
                color={token.color || '#34495e'}
                content={token.content}
                rotation={0}
                borderWidth={token.borderWidth ?? 3}
                borderColor={(token as any).borderColor || 'white'}
                opacity={token.opacity ?? 100}
                borderOpacity={token.borderOpacity ?? 100}
                showThickness={true}
                tokenName={(token as any).showName ? token.name : undefined}
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );
};
