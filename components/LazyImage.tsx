/**
 * LazyImage - Optimized image component with lazy loading
 *
 * Uses new CAS (Content-Addressable Storage) system.
 */

import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { getAssetURL, preloadAssets } from '../utils/assets';
import { getGlobalCacheVersion } from './SvgTokenShape';

export interface LazyImageProps {
  src: string;              // Hash (sha256:...) or URL
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  onLoad?: () => void;
  onError?: () => void;
  rootMargin?: string;
  threshold?: number;
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
}

const DEFAULT_PLACEHOLDER = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%231e293b'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' font-family='sans-serif' font-size='14' fill='%2394a3b8'%3ELoading...%3C/text%3E%3C/svg%3E`;

/**
 * Check if src is an asset hash
 */
function isAssetHash(src: string): boolean {
  return src?.startsWith('sha256:') || false;
}

export const LazyImage = memo<LazyImageProps>(({
  src,
  alt,
  className = '',
  style = {},
  placeholder = DEFAULT_PLACEHOLDER,
  onLoad,
  onError,
  rootMargin = '50px',
  threshold = 0.01,
  crossOrigin,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const [cacheVersion, setCacheVersion] = useState(getGlobalCacheVersion());

  // Track cache version
  useEffect(() => {
    const currentVersion = getGlobalCacheVersion();
    if (currentVersion !== cacheVersion) {
      setCacheVersion(currentVersion);
      setImageSrc(null);
      setIsLoaded(false);
    }
  }, [cacheVersion]);

  useEffect(() => {
    if (imageSrc) return;

    if (typeof IntersectionObserver === 'undefined') {
      loadImage(src);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !imageSrc) {
          loadImage(src);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src, imageSrc, rootMargin, threshold]);

  const loadImage = async (srcToLoad: string) => {
    try {
      let finalSrc = srcToLoad;

      // Resolve asset hash to ObjectURL
      if (isAssetHash(srcToLoad)) {
        const url = await getAssetURL(srcToLoad);
        if (url) {
          finalSrc = url;
        } else {
          throw new Error(`getAssetURL returned null for ${srcToLoad}`);
        }
      }

      setImageSrc(finalSrc);

      // Preload to detect when fully loaded
      const img = new Image();
      if (crossOrigin) {
        img.crossOrigin = crossOrigin;
      }
      img.onload = () => {
        setIsLoaded(true);
        onLoad?.();
      };
      img.onerror = () => {
        setIsError(true);
        onError?.();
      };
      img.src = finalSrc;

    } catch (error) {
      console.error(`[LazyImage] Failed to load ${srcToLoad}:`, error);
      // 🔥 FIX: Don't set imageSrc to hash URLs - they cause CSP violations
      // Leave imageSrc as null to show placeholder
      setIsError(true);
      onError?.();
    }
  };

  return (
    <img
      ref={imgRef}
      src={imageSrc || placeholder}
      alt={alt}
      className={className}
      style={{
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
        ...style,
      }}
      loading="lazy"
      crossOrigin={crossOrigin}
      onError={() => setIsError(true)}
    />
  );
});

LazyImage.displayName = 'LazyImage';

/**
 * Hook to preload critical images
 */
export function useImagePreloader() {
  const preloadImage = useCallback((src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = reject;

      if (isAssetHash(src)) {
        getAssetURL(src).then(url => {
          img.src = url;
        }).catch(reject);
      } else {
        img.src = src;
      }
    });
  }, []);

  const preloadImages = useCallback((urls: string[]): Promise<void[]> => {
    return Promise.all(urls.map(url => preloadImage(url)));
  }, [preloadImage]);

  return { preloadImage, preloadImages };
}

/**
 * Background image version
 */
export interface LazyBackgroundImageProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  placeholder?: string;
  rootMargin?: string;
  threshold?: number;
  crossOrigin?: 'anonymous' | 'use-credentials' | '';
}

export const LazyBackgroundImage = memo<LazyBackgroundImageProps>(({
  src,
  className = '',
  style = {},
  children,
  placeholder = '#1e293b',
  rootMargin = '50px',
  threshold = 0.01,
  crossOrigin,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [cacheVersion, setCacheVersion] = useState(getGlobalCacheVersion());
  const containerRef = useRef<HTMLDivElement>(null);

  // Track cache version
  useEffect(() => {
    const currentVersion = getGlobalCacheVersion();
    if (currentVersion !== cacheVersion) {
      setCacheVersion(currentVersion);
      if (isAssetHash(src)) {
        setResolvedSrc(null);
        setIsLoaded(false);
      }
    }
  }, [cacheVersion, src]);

  // Resolve asset when visible
  useEffect(() => {
    if (!isVisible) return;

    const resolveSrc = async () => {
      try {
        if (isAssetHash(src)) {
          const objectUrl = await getAssetURL(src);
          if (objectUrl) {
            setResolvedSrc(objectUrl);
          } else {
            console.error(`[LazyBackgroundImage] getAssetURL returned null for ${src}`);
            // Don't set resolvedSrc - will show placeholder instead
          }
        } else {
          setResolvedSrc(src);
        }
      } catch (error) {
        console.error(`[LazyBackgroundImage] Failed to resolve ${src}:`, error);
        // 🔥 FIX: Never fall back to hash URLs - they cause CSP violations
        // Only set resolvedSrc if it's not a hash
        if (!isAssetHash(src)) {
          setResolvedSrc(src);
        }
        // For hash URLs that fail, leave resolvedSrc as null to show placeholder
      }
    };

    resolveSrc();
  }, [src, isVisible]);

  // Intersection observer
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  // Detect when image is loaded
  useEffect(() => {
    if (!isVisible || isLoaded || !resolvedSrc) return;

    const img = new Image();
    if (crossOrigin) {
      img.crossOrigin = crossOrigin;
    }
    img.onload = () => setIsLoaded(true);
    img.src = resolvedSrc;
  }, [resolvedSrc, isVisible, isLoaded, crossOrigin]);

  const backgroundStyle = React.useMemo(() => ({
    backgroundImage: isLoaded && resolvedSrc ? `url(${resolvedSrc})` : 'none',
    backgroundColor: isLoaded ? 'transparent' : placeholder,
    backgroundSize: style?.backgroundSize || 'cover',
    backgroundPosition: style?.backgroundPosition || 'center',
    backgroundRepeat: style?.backgroundRepeat || 'no-repeat',
    imageRendering: style?.imageRendering,
    ...style,
  }), [isLoaded, resolvedSrc, placeholder, style]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={backgroundStyle}
    >
      {children}
    </div>
  );
});

LazyBackgroundImage.displayName = 'LazyBackgroundImage';
