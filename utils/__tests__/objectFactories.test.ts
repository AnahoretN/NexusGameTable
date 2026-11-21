import { describe, it, expect } from 'vitest';
import {
  createFireSweepEffect,
  createWindSweepEffect,
  createEffectTemplateByName,
} from '../objectFactories';
import { ItemType } from '../../types';

describe('createFireSweepEffect', () => {
  it('enables the display angle by default at 90° (upper portion)', () => {
    const effect = createFireSweepEffect();
    expect(effect.type).toBe(ItemType.EFFECT_TEMPLATE);
    expect(effect.displayAngleEnabled).toBe(true);
    expect(effect.displayAngle).toBe(90);
    expect(effect.playerControlEnabled).toBe(true);
    expect(effect.playerCanSeeMarkers).toBe(true);
  });

  it('pivots at the arc center (≈50%/55% of the canvas)', () => {
    const effect = createFireSweepEffect();
    expect(effect.pivot.x).toBe(50);
    expect(effect.pivot.y).toBe(55);
  });

  it('shares the radial preset defaults (proportional scaling, boards layer)', () => {
    const effect = createFireSweepEffect();
    expect(effect.proportionalScaling).toBe(true);
    expect(effect.hyperscaleLayerId).toBe('boards');
    expect(effect.rotationMarkerDistance).toBeGreaterThan(0);
    expect(effect.rotationMarkerDistance!).toBeLessThan(effect.height);
  });
});

describe('createEffectTemplateByName routing', () => {
  it('routes sweep effects by name before the cone/explosion fallbacks', () => {
    const effect = createEffectTemplateByName({ name: 'Fire Sweep Effect' });
    expect(effect.content).toContain('FireSweepEffect');
    expect(effect.displayAngleEnabled).toBe(true);
  });

  it('routes the wind sweep before the generic "Sweep" fallback', () => {
    const effect = createEffectTemplateByName({ name: 'Wind Sweep Effect' });
    expect(effect.content).toContain('WindSweepEffect');
    expect(effect.displayAngleEnabled).toBe(true);
    expect(effect.displayAngle).toBe(90);
    expect(effect.pivot).toEqual({ x: 50, y: 55 });
    // named factory and routed factory must produce the same art
    expect(createWindSweepEffect().content).toBe(effect.content);
  });
});
