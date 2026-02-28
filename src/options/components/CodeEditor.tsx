import React from "react";
import Editor, { OnMount, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Use locally bundled monaco-editor instead of CDN (required for Chrome extensions)
loader.config({ monaco });

interface CodeEditorProps {
    language: "json" | "shell" | "graphql" | "plaintext";
    value: string;
    onChange?: (value: string) => void;
    height?: string | number;
    readOnly?: boolean;
    placeholder?: string;
    /** When true, the editor fills remaining flex space in its parent */
    flex?: boolean;
}

/**
 * Custom dark theme matching the Notion-inspired GROE design system.
 */
const GROE_THEME_NAME = "groe-dark";

function defineGroeTheme(monaco: Parameters<OnMount>[1]) {
    monaco.editor.defineTheme(GROE_THEME_NAME, {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "string", foreground: "c4b5fd" },
            { token: "number", foreground: "34d399" },
            { token: "keyword", foreground: "2eaadc" },
            { token: "delimiter", foreground: "d4d4d4" },
            { token: "delimiter.bracket", foreground: "d4d4d4" },
            { token: "delimiter.array", foreground: "d4d4d4" },
            { token: "delimiter.comma", foreground: "d4d4d4" },
            { token: "delimiter.colon", foreground: "d4d4d4" },
            { token: "string.key.json", foreground: "2eaadc" },
            { token: "string.value.json", foreground: "c4b5fd" },
        ],
        colors: {
            "editor.background": "#191919",
            "editor.foreground": "#e0e0e0",
            "editor.lineHighlightBackground": "#ffffff08",
            "editor.selectionBackground": "#2eaadc33",
            "editorCursor.foreground": "#2eaadc",
            "editorLineNumber.foreground": "#555",
            "editorLineNumber.activeForeground": "#888",
            "editor.inactiveSelectionBackground": "#2eaadc18",
            "editorWidget.background": "#202020",
            "editorWidget.border": "#ffffff15",
            "input.background": "#191919",
            "input.border": "#ffffff15",
            "focusBorder": "#2eaadc66",
            "editorBracketHighlight.foreground1": "#ffd700",
            "editorBracketHighlight.foreground2": "#da70d6",
            "editorBracketHighlight.foreground3": "#2eaadc",
            "editorBracketMatch.background": "#2eaadc33",
            "editorBracketMatch.border": "#2eaadc",
        },
    });
}

let themeIsDefined = false;

const CodeEditor: React.FC<CodeEditorProps> = ({
    language,
    value,
    onChange,
    height = 220,
    readOnly = false,
    flex = false,
}) => {
    const handleMount: OnMount = (_editor, monaco) => {
        if (!themeIsDefined) {
            defineGroeTheme(monaco);
            themeIsDefined = true;
        }
        monaco.editor.setTheme(GROE_THEME_NAME);
    };

    return (
        <div className={`code-editor-wrapper${flex ? " code-editor-flex" : ""}`}>
            <Editor
                height={height}
                language={language === "shell" ? "plaintext" : language}
                value={value}
                onChange={(val) => onChange?.(val ?? "")}
                onMount={handleMount}
                theme={GROE_THEME_NAME}
                options={{
                    readOnly,
                    minimap: { enabled: false },
                    wordWrap: "on",
                    lineNumbers: "on",
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
                    scrollBeyondLastLine: false,
                    renderLineHighlight: "line",
                    padding: { top: 10, bottom: 10 },
                    bracketPairColorization: { enabled: true },
                    folding: true,
                    tabSize: 2,
                    scrollbar: {
                        verticalScrollbarSize: 6,
                        horizontalScrollbarSize: 6,
                    },
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                    overviewRulerLanes: 0,
                }}
            />
        </div>
    );
};

export default CodeEditor;
