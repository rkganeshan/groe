import React, { useState, useMemo } from "react";
import { parseCurl, parseCurlRaw } from "../../shared/parseCurl";
import { Rule, createDefaultRule } from "../../shared/types";
import CodeEditor from "./CodeEditor";
import Modal from "./Modal";

interface CurlImportModalProps {
    onImport: (rule: Rule) => void;
    onCancel: () => void;
}

function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const CurlImportModal: React.FC<CurlImportModalProps> = ({
    onImport,
    onCancel,
}) => {
    const [curlInput, setCurlInput] = useState("");

    const parsed = useMemo(() => {
        if (!curlInput.trim()) return null;
        try {
            return parseCurlRaw(curlInput);
        } catch {
            return null;
        }
    }, [curlInput]);

    const rulePartial = useMemo(() => {
        if (!curlInput.trim()) return null;
        try {
            return parseCurl(curlInput);
        } catch {
            return null;
        }
    }, [curlInput]);

    const isEmpty = !curlInput.trim();
    const hasUrl = !!parsed?.url;

    function handleImport() {
        if (!rulePartial) return;
        const rule = createDefaultRule({
            id: generateId(),
            ...rulePartial,
        });
        onImport(rule);
    }

    return (
        <Modal
            title="Import from cURL"
            className="curl-import-modal"
            onClose={onCancel}
            footer={
                <>
                    <button className="btn" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={isEmpty || !hasUrl}
                    >
                        Import & Create Rule
                    </button>
                </>
            }
        >
            <div className="curl-import-body">
                <div className="curl-input-panel">
                    <label className="form-label">Paste cURL Command</label>
                    <span className="form-sublabel">
                        Copy a cURL command from your browser's DevTools (Network tab →
                        right-click → Copy as cURL)
                    </span>
                    <CodeEditor
                        language="shell"
                        value={curlInput}
                        onChange={setCurlInput}
                        height={280}
                    />
                </div>

                <div className="curl-preview-panel">
                    <label className="form-label">Extracted Fields</label>
                    {isEmpty ? (
                        <div className="curl-preview-empty">
                            <div className="curl-preview-empty-icon">📋</div>
                            <p>Paste a cURL command to see extracted fields</p>
                        </div>
                    ) : !hasUrl ? (
                        <div className="curl-preview-empty">
                            <div className="curl-preview-empty-icon">⚠️</div>
                            <p>Could not parse the cURL command. Check the format.</p>
                        </div>
                    ) : (
                        <div className="curl-preview-fields">
                            <PreviewField label="URL" value={parsed?.url} />
                            <PreviewField label="Method" value={parsed?.method} />
                            <PreviewField
                                label="Operation"
                                value={rulePartial?.operationName}
                            />
                            {parsed?.query && (
                                <PreviewField
                                    label="Query"
                                    value={
                                        parsed.query.length > 120
                                            ? parsed.query.slice(0, 120) + "…"
                                            : parsed.query
                                    }
                                />
                            )}
                            {rulePartial?.variableConditions &&
                                rulePartial.variableConditions.length > 0 && (
                                    <div className="preview-field">
                                        <span className="preview-label">Variables</span>
                                        <div className="preview-tags">
                                            {rulePartial.variableConditions.map((c, i) => (
                                                <span key={i} className="rule-meta-tag operation">
                                                    {c.field} ={" "}
                                                    {c.value.length > 30
                                                        ? c.value.slice(0, 30) + "…"
                                                        : c.value}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

/** A single preview field row */
function PreviewField({
    label,
    value,
}: {
    label: string;
    value?: string;
}) {
    if (!value) return null;
    return (
        <div className="preview-field">
            <span className="preview-label">{label}</span>
            <span className="preview-value">{value}</span>
        </div>
    );
}

export default CurlImportModal;
