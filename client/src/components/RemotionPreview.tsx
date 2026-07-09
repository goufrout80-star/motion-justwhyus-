import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import React from 'react';
import * as Babel from '@babel/standalone';
import * as Remotion from 'remotion';
import { Player, type PlayerRef } from '@remotion/player';

interface RemotionPreviewProps {
  code: string;
  durationInFrames: number;
  fps?: number;
  width?: number;
  height?: number;
  playerRef?: React.Ref<PlayerRef>;
}

/**
 * The AI writes plain code that references Remotion primitives as bare
 * identifiers (AbsoluteFill, useCurrentFrame, ...) rather than
 * Remotion.AbsoluteFill — this destructures them into scope before the
 * generated body runs, so the model's output doesn't need any import
 * statements at all.
 */
const REMOTION_GLOBALS =
  'const { AbsoluteFill, Sequence, Series, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, random, Img, staticFile } = Remotion;';

/** Strips accidental import/export syntax defensively — the model is
 * instructed not to use it, but a stray line here shouldn't hard-crash the
 * whole preview when Babel's classic (non-ESM) preset can't parse it. */
function stripModuleSyntax(code: string): string {
  return code
    .split('\n')
    .filter((line) => !/^\s*import\s.+from\s/.test(line))
    .join('\n')
    .replace(/^\s*export\s+(default\s+)?/gm, '');
}

function compileComposition(rawCode: string): React.ComponentType {
  const code = stripModuleSyntax(rawCode);
  const transformed = Babel.transform(code, { presets: ['react'], filename: 'composition.jsx' }).code;
  if (!transformed) throw new Error('Babel produced no output for this composition.');

  // eslint-disable-next-line no-new-func -- intentional: this is the whole
  // point of an in-browser AI code preview (see RemotionStudioView docs).
  const factory = new Function(
    'React',
    'Remotion',
    `${REMOTION_GLOBALS}\n${transformed}\nreturn typeof Composition !== 'undefined' ? Composition : null;`
  );

  const Comp = factory(React, Remotion);
  if (typeof Comp !== 'function') {
    throw new Error('The code must define: const Composition = () => { ... };');
  }
  return Comp as React.ComponentType;
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function RemotionPreview({
  code,
  durationInFrames,
  fps = 30,
  width = 1280,
  height = 720,
  playerRef,
}: RemotionPreviewProps) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    setRuntimeError(null);
  }, [code]);

  const { Comp, compileError } = useMemo(() => {
    if (!code.trim()) return { Comp: null, compileError: null as string | null };
    try {
      return { Comp: compileComposition(code), compileError: null as string | null };
    } catch (err) {
      return { Comp: null, compileError: err instanceof Error ? err.message : String(err) };
    }
  }, [code]);

  if (!code.trim()) {
    return (
      <div className="remotion-preview-empty">
        <p>No composition yet — describe what you want in the chat to get started.</p>
      </div>
    );
  }

  const error = compileError || runtimeError;
  if (error) {
    return (
      <div className="remotion-preview-error">
        <strong>{compileError ? 'Compile error' : 'Runtime error'}</strong>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <PreviewErrorBoundary key={code} onError={setRuntimeError}>
      <Player
        ref={playerRef}
        component={Comp!}
        durationInFrames={durationInFrames}
        compositionWidth={width}
        compositionHeight={height}
        fps={fps}
        controls
        loop
        style={{ width: '100%', aspectRatio: `${width} / ${height}` }}
      />
    </PreviewErrorBoundary>
  );
}
