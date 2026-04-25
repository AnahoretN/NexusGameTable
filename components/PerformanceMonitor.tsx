/**
 * Performance Monitor Component
 *
 * Integrates comprehensive performance monitoring into the application.
 * Tracks renders, memory usage, FPS, and provides real-time metrics.
 */

import React, { useState, useEffect, useRef } from 'react';
import { performanceTestSuite } from '../utils/performanceTest';

interface PerformanceData {
  renderCounts: Record<string, number>;
  memoryUsage: {
    used: string;
    total: string;
    limit: string;
    percentage: number;
  } | null;
  fps: number;
  componentStats: Array<{
    componentName: string;
    renderCount: number;
    averageRenderTime: number;
    maxRenderTime: number;
  }>;
  isMonitoring: boolean;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  updateInterval?: number;
  showUI?: boolean;
  onReportGenerated?: (report: string) => void;
}

export const PerformanceMonitorComponent: React.FC<PerformanceMonitorProps> = ({
  enabled = process.env.NODE_ENV === 'development',
  updateInterval = 5000, // 5 seconds
  showUI = false,
  onReportGenerated
}) => {
  const [perfData, setPerfData] = useState<PerformanceData>({
    renderCounts: {},
    memoryUsage: null,
    fps: 60,
    componentStats: [],
    isMonitoring: false
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());

  /**
   * Start performance monitoring
   */
  const startMonitoring = () => {
    if (!enabled) return;

    performanceTestSuite.startTest('Application Session');

    setPerfData(prev => ({ ...prev, isMonitoring: true }));

    // Set up periodic updates
    intervalRef.current = window.setInterval(() => {
      updatePerformanceData();
    }, updateInterval);

    // Start FPS monitoring
    startFPSMonitoring();
  };

  /**
   * Stop performance monitoring
   */
  const stopMonitoring = () => {

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (perfData.isMonitoring) {
      performanceTestSuite.endTest('Application Session');
    }

    setPerfData(prev => ({ ...prev, isMonitoring: false }));
  };

  /**
   * Update performance data
   */
  const updatePerformanceData = () => {
    const memoryUsage = performanceTestSuite.getMemoryUsage();
    const componentStats = performanceTestSuite.getComponentStats();

    setPerfData({
      renderCounts: performanceTestSuite.getResults().reduce((acc, result) => ({
        ...acc,
        ...result.metrics.renderCounts
      }), {}),
      memoryUsage: memoryUsage ? {
        used: memoryUsage.usedJSHeapSize,
        total: memoryUsage.totalJSHeapSize,
        limit: memoryUsage.jsHeapSizeLimit,
        percentage: memoryUsage.usedPercentage
      } : null,
      fps: calculateFPS(),
      componentStats: componentStats.slice(0, 10), // Top 10 components
      isMonitoring: perfData.isMonitoring
    });
  };

  /**
   * Calculate current FPS
   */
  const calculateFPS = (): number => {
    const currentTime = performance.now();
    const deltaTime = currentTime - lastFrameTimeRef.current;

    if (deltaTime >= 1000) {
      const fps = Math.round((frameCountRef.current * 1000) / deltaTime);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = currentTime;
      return fps;
    }

    return 60; // Placeholder
  };

  /**
   * Start FPS monitoring
   */
  const startFPSMonitoring = () => {
    const measureFPS = () => {
      frameCountRef.current++;
      requestAnimationFrame(measureFPS);
    };
    requestAnimationFrame(measureFPS);
  };

  /**
   * Generate and export performance report
   */
  const generateReport = () => {
    const report = performanceTestSuite.generateReport();

    if (onReportGenerated) {
      onReportGenerated(report);
    }

    // Also save to localStorage
    try {
      localStorage.setItem('performanceReport', report);
    } catch (e) {
    }

    return report;
  };

  /**
   * Export results as JSON
   */
  const exportJSON = () => {
    const json = performanceTestSuite.exportResults();

    // Download as file
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Lifecycle
  useEffect(() => {
    if (enabled) {
      startMonitoring();

      return () => {
        stopMonitoring();
      };
    }
  }, [enabled]);

  // Don't render anything if UI is disabled
  if (!showUI) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: '#00ff00',
        padding: '10px',
        borderRadius: '5px',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 9999,
        minWidth: '300px',
        maxHeight: isExpanded ? '600px' : '150px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <strong>🔍 Performance Monitor</strong>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          style={{
            background: 'transparent',
            border: '1px solid #00ff00',
            color: '#00ff00',
            cursor: 'pointer',
            padding: '2px 8px',
          }}
        >
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {/* Status */}
      <div style={{ marginBottom: '10px' }}>
        <span style={{ color: perfData.isMonitoring ? '#00ff00' : '#ff0000' }}>
          {perfData.isMonitoring ? '● Monitoring' : '○ Stopped'}
        </span>
        {perfData.isMonitoring && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              stopMonitoring();
            }}
            style={{
              marginLeft: '10px',
              background: 'transparent',
              border: '1px solid #ff0000',
              color: '#ff0000',
              cursor: 'pointer',
              padding: '2px 8px',
            }}
          >
            Stop
          </button>
        )}
        {!perfData.isMonitoring && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              startMonitoring();
            }}
            style={{
              marginLeft: '10px',
              background: 'transparent',
              border: '1px solid #00ff00',
              color: '#00ff00',
              cursor: 'pointer',
              padding: '2px 8px',
            }}
          >
            Start
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          {/* Memory Usage */}
          {perfData.memoryUsage && (
            <div style={{ marginBottom: '10px' }}>
              <div>💾 Memory:</div>
              <div style={{ marginLeft: '10px' }}>
                <div>Used: {perfData.memoryUsage.used}</div>
                <div>Total: {perfData.memoryUsage.total}</div>
                <div>Limit: {perfData.memoryUsage.limit}</div>
                <div style={{
                  color: perfData.memoryUsage.percentage > 50 ? '#ff0000' :
                         perfData.memoryUsage.percentage > 30 ? '#ffff00' : '#00ff00'
                }}>
                  Usage: {perfData.memoryUsage.percentage.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          {/* FPS */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              color: perfData.fps >= 55 ? '#00ff00' :
                     perfData.fps >= 30 ? '#ffff00' : '#ff0000'
            }}>
              🎯 FPS: {perfData.fps}
            </div>
          </div>

          {/* Component Stats */}
          {perfData.componentStats.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div>📊 Top Components:</div>
              <div style={{ marginLeft: '10px' }}>
                {perfData.componentStats.map((stat, index) => (
                  <div key={index} style={{ marginBottom: '5px' }}>
                    <div>{stat.componentName}:</div>
                    <div style={{ marginLeft: '10px', fontSize: '11px' }}>
                      Renders: {stat.renderCount} |
                      Avg: {stat.averageRenderTime.toFixed(2)}ms |
                      Max: {stat.maxRenderTime.toFixed(2)}ms
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: '10px', borderTop: '1px solid #00ff00', paddingTop: '10px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                generateReport();
              }}
              style={{
                marginRight: '5px',
                background: 'transparent',
                border: '1px solid #00ff00',
                color: '#00ff00',
                cursor: 'pointer',
                padding: '5px 10px',
              }}
            >
              📄 Report
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                exportJSON();
              }}
              style={{
                background: 'transparent',
                border: '1px solid #00ff00',
                color: '#00ff00',
                cursor: 'pointer',
                padding: '5px 10px',
              }}
            >
              💾 Export
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Hook to use performance monitoring in components
 */
export function usePerformanceMonitoring(componentName: string) {
  const renderStartTime = useRef<number>(performance.now());
  const renderCount = useRef<number>(0);

  useEffect(() => {
    const renderTime = performance.now() - renderStartTime.current;
    performanceTestSuite.trackComponentRender(componentName, renderTime);

    renderCount.current++;
    renderStartTime.current = performance.now();
  });

  return {
    renderCount: renderCount.current,
    trackPerformance: (operationName: string, operation: () => void) => {
      const start = performance.now();
      operation();
      const duration = performance.now() - start;
      performanceTestSuite.trackComponentRender(`${componentName}_${operationName}`, duration);
    }
  };
};

export default PerformanceMonitorComponent;