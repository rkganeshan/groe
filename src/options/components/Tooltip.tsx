import React, { useState, useRef, useEffect, ReactNode } from "react";
import ReactDOM from "react-dom";

interface TooltipProps {
    content: string;
    children: ReactNode;
    position?: "top" | "bottom" | "left" | "right";
    delayMs?: number;
}

const Tooltip: React.FC<TooltipProps> = ({
    content,
    children,
    position = "bottom",
    delayMs = 200,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const wrapperRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<number | null>(null);

    const handleMouseEnter = () => {
        timeoutRef.current = window.setTimeout(() => {
            setIsVisible(true);
        }, delayMs);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsVisible(false);
    };

    useEffect(() => {
        if (isVisible && wrapperRef.current && tooltipRef.current) {
            const targetRect = wrapperRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();

            let top = 0;
            let left = 0;

            switch (position) {
                case "top":
                    top = targetRect.top - tooltipRect.height - 6;
                    left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
                    break;
                case "bottom":
                    top = targetRect.bottom + 6;
                    left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
                    break;
                case "left":
                    top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
                    left = targetRect.left - tooltipRect.width - 6;
                    break;
                case "right":
                    top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
                    left = targetRect.right + 6;
                    break;
            }

            // Keep it within viewport bounds
            const padding = 8;
            if (left < padding) left = padding;
            if (left + tooltipRect.width > window.innerWidth - padding) {
                left = window.innerWidth - tooltipRect.width - padding;
            }
            if (top < padding) top = padding;
            if (top + tooltipRect.height > window.innerHeight - padding) {
                top = window.innerHeight - tooltipRect.height - padding;
            }

            setCoords({ top, left });
        }
    }, [isVisible, position]);

    return (
        <>
            <div
                ref={wrapperRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{ display: "inline-flex" }}
            >
                {children}
            </div>
            {isVisible &&
                ReactDOM.createPortal(
                    <div
                        ref={tooltipRef}
                        className="portal-tooltip"
                        style={{
                            position: "fixed",
                            top: coords.top,
                            left: coords.left,
                            zIndex: 10000,
                            pointerEvents: "none",
                        }}
                    >
                        {content}
                    </div>,
                    document.body
                )}
        </>
    );
};

export default Tooltip;
