import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

interface ConfirmPopoverProps {
    isOpen: boolean;
    anchorRef: React.RefObject<HTMLElement>;
    onClose: () => void;
    onConfirm: () => void;
    message: React.ReactNode;
}

const ConfirmPopover: React.FC<ConfirmPopoverProps> = ({
    isOpen,
    anchorRef,
    onClose,
    onConfirm,
    message,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!isOpen || !anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        setPosition({
            top: rect.bottom + 6,
            left: rect.right,
        });

        const handleClick = (e: MouseEvent) => {
            // Don't close if clicking inside the popover
            if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
                return;
            }
            // Don't close if clicking the anchor (button) itself, as the button's onClick will handle toggling
            if (anchorRef.current && anchorRef.current.contains(e.target as Node)) {
                return;
            }
            onClose();
        };

        // Use setTimeout so the current click event doesn't trigger the listener immediately
        const timeout = setTimeout(() => {
            document.addEventListener("mousedown", handleClick);
        }, 0);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener("mousedown", handleClick);
        };
    }, [isOpen, anchorRef, onClose]);

    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div
            className="confirm-delete-popover"
            ref={popoverRef}
            style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                transform: "translateX(-100%)",
                zIndex: 10000,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <p>{message}</p>
            <div className="confirm-actions">
                <button className="btn btn-sm" onClick={onClose}>
                    Cancel
                </button>
                <button className="btn-danger" onClick={onConfirm}>
                    Delete
                </button>
            </div>
        </div>,
        document.body
    );
};

export default ConfirmPopover;
