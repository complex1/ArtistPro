import { useEffect, useRef } from 'react'
import { EditorView, minimalSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'

export function AnimationCodeEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      doc: initialValueRef.current,
      parent: hostRef.current,
      extensions: [
        minimalSetup,
        javascript(),
        EditorView.lineWrapping,
        // drawSelection() replaces the native caret with its own element, so the
        // cursor and selection need explicit colors to show on a dark surface.
        EditorView.theme(
          {
            '&': {
              height: '100%',
              backgroundColor: '#111318',
              color: '#d7dbe5',
            },
            '.cm-content': {
              caretColor: '#7aa2ff',
            },
            '.cm-cursor, .cm-cursor-primary, .cm-dropCursor': {
              borderLeft: '2px solid #7aa2ff',
            },
            '.cm-cursor-secondary': {
              borderLeft: '2px solid #4a6099',
            },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
              {
                backgroundColor: '#2b3650',
              },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '12px',
              lineHeight: '1.55',
              overflow: 'auto',
            },
            '.cm-gutters': {
              backgroundColor: '#111318',
              borderRight: '1px solid #2a2e38',
              color: '#697080',
            },
            '.cm-activeLine, .cm-activeLineGutter': {
              backgroundColor: '#1a1e27',
            },
          },
          { dark: true },
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
      ],
    })
    viewRef.current = view
    return () => {
      viewRef.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  return <div className="brush-code-editor" ref={hostRef} />
}
