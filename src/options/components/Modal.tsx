import React, { useEffect } from "react";
import Tooltip from "./Tooltip";

interface ModalProps {
  /** Title shown in the sticky header */
  title: string;
  /** Additional CSS class on the modal container */
  className?: string;
  /** Called when the user clicks the backdrop or close button */
  onClose: () => void;
  /** Footer content (buttons etc.) */
  footer?: React.ReactNode;
  /** Modal content */
  children: React.ReactNode;
}

/**
 * Reusable modal with sticky header/footer and scrollable body.
 */
const Modal: React.FC<ModalProps> = ({
  title,
  className = "",
  onClose,
  footer,
  children,
}) => {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <Tooltip content="Close" position="left">
            <button className="btn-icon" onClick={onClose}>
              {"\u2715"}
            </button>
          </Tooltip>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
