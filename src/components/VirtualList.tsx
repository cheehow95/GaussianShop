// Virtual List Component - Efficient rendering for large lists
// Only renders visible items for performance

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import './VirtualList.css';

export interface VirtualListProps<T> {
    items: T[];
    itemHeight: number;
    renderItem: (item: T, index: number) => ReactNode;
    overscan?: number;
    className?: string;
}

export function VirtualList<T>({
    items,
    itemHeight,
    renderItem,
    overscan = 3,
    className = '',
}: VirtualListProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });

        resizeObserver.observe(container);
        setContainerHeight(container.clientHeight);

        return () => resizeObserver.disconnect();
    }, []);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
        items.length,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    const visibleItems = items.slice(startIndex, endIndex);
    const offsetY = startIndex * itemHeight;

    return (
        <div
            ref={containerRef}
            className={`virtual-list-container ${className}`}
            onScroll={handleScroll}
        >
            <div className="virtual-list-content" style={{ height: totalHeight }}>
                <div
                    className="virtual-list-items"
                    style={{ transform: `translateY(${offsetY}px)` }}
                >
                    {visibleItems.map((item, i) => (
                        <div
                            key={startIndex + i}
                            className="virtual-list-item"
                            style={{ height: itemHeight }}
                        >
                            {renderItem(item, startIndex + i)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default VirtualList;
