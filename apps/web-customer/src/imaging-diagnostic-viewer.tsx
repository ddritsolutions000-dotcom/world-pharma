'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';

export type DiagnosticViewerSession = {
  imaging_study_id: string;
  imaging_booking_id: string;
  study_instance_uid: string;
  accession_number: string;
  modality_code: string | null;
  study_description: string | null;
  study_date_time: string | null;
  sandbox: boolean;
  viewer: {
    available: boolean;
    certified_diagnostic_workstation: boolean;
    note: string;
    report_separate_from_viewer?: boolean;
  };
  series: Array<{
    series_id: string;
    series_instance_uid: string;
    series_number: number;
    modality_code: string | null;
    description: string | null;
    frame_count: number;
    instance_count: number;
  }>;
  capabilities: {
    zoom: boolean;
    pan: boolean;
    rotate: boolean;
    reset: boolean;
    fit_to_screen: boolean;
    series_navigation: boolean;
    slice_navigation: boolean;
    fullscreen: boolean;
  };
};

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

type Props = {
  session: DiagnosticViewerSession | null;
  loadState: LoadState;
  errorDetail?: string | null;
  onRetry?: () => void;
  /** Fetch a frame as blob URL (authorized). */
  fetchFrameBlob: (seriesId: string, frameIndex: number) => Promise<Blob>;
  reportHref?: string | null;
  backHref?: string | null;
  backLabel?: string;
};

export function ImagingDiagnosticViewerPanel({
  session,
  loadState,
  errorDetail,
  onRetry,
  fetchFrameBlob,
  reportHref,
  backHref,
  backLabel = 'Back',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [seriesIdx, setSeriesIdx] = useState(0);
  const [frameIdx, setFrameIdx] = useState(0);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fitMode, setFitMode] = useState(true);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const series = session?.series[seriesIdx] ?? null;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container || !img.complete) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cw = Math.max(280, container.clientWidth);
    const ch = Math.max(280, Math.min(640, Math.floor(container.clientWidth * 0.75)));
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, cw, ch);

    let drawScale = scale;
    if (fitMode) {
      const pad = 16;
      drawScale = Math.min((cw - pad) / img.naturalWidth, (ch - pad) / img.naturalHeight);
    }

    ctx.save();
    ctx.translate(cw / 2 + offset.x, ch / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(drawScale, drawScale);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [fitMode, offset.x, offset.y, rotation, scale]);

  useEffect(() => {
    if (!session || !series) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setFrameLoading(true);
    setFrameError(null);
    void (async () => {
      try {
        const blob = await fetchFrameBlob(series.series_id, frameIdx);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imageRef.current = img;
          setFrameLoading(false);
          redraw();
        };
        img.onerror = () => {
          if (cancelled) return;
          setFrameLoading(false);
          setFrameError('Could not decode imaging frame.');
        };
        img.src = objectUrl;
      } catch (err) {
        if (cancelled) return;
        setFrameLoading(false);
        setFrameError(err instanceof Error ? err.message : 'Frame load failed');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session, series, frameIdx, fetchFrameBlob, redraw]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [redraw]);

  const resetView = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setFitMode(true);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  if (loadState === 'loading' || loadState === 'idle') {
    return <LoadingState label="Opening diagnostic viewer…" />;
  }
  if (loadState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (loadState === 'error') {
    return (
      <NetworkErrorState
        action={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
      />
    );
  }
  if (loadState === 'empty' || !session || !series) {
    return (
      <EmptyState
        title="Study not viewable"
        description={errorDetail ?? 'No imaging frames are available for this study yet.'}
      />
    );
  }

  return (
    <div className="wp-imaging-viewer wp-imaging-viewer--dark" style={{ display: 'grid', gap: '1rem' }}>
      <Card>
        <Heading level={2}>Study</Heading>
        <Text tone="secondary">
          {session.study_description ?? 'Imaging study'} · {session.modality_code ?? '—'} · Accession{' '}
          {session.accession_number}
        </Text>
        <Text size="caption" tone="secondary">
          Study UID: {session.study_instance_uid}
          {session.study_date_time ? ` · ${new Date(session.study_date_time).toLocaleString()}` : ''}
        </Text>
        <Text size="caption" tone="secondary">
          {session.viewer.note}
        </Text>
        {!session.viewer.certified_diagnostic_workstation ? (
          <Text size="caption" tone="secondary">
            Not a certified diagnostic workstation — for application review of sandbox/test frames. Report
            text remains separate from images.
          </Text>
        ) : null}
      </Card>

      <Card>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.75rem',
          }}
        >
          <Heading level={3}>Images</Heading>
          <div style={{ flex: 1 }} />
          {backHref ? (
            <a className="mg-btn mg-btn-secondary mg-btn-sm" href={backHref}>
              {backLabel}
            </a>
          ) : null}
          {reportHref ? (
            <a className="mg-btn mg-btn-secondary mg-btn-sm" href={reportHref}>
              View report
            </a>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <label>
            Series{' '}
            <select
              value={seriesIdx}
              onChange={(e) => {
                setSeriesIdx(Number(e.target.value));
                setFrameIdx(0);
                resetView();
              }}
            >
              {session.series.map((s, i) => (
                <option key={s.series_id} value={i}>
                  #{s.series_number} {s.description ?? s.modality_code ?? 'Series'} ({s.frame_count}{' '}
                  frames)
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={frameIdx <= 0}
            onClick={() => setFrameIdx((n) => Math.max(0, n - 1))}
          >
            Prev slice
          </Button>
          <Text size="caption">
            Slice {frameIdx + 1} / {series.frame_count}
          </Text>
          <Button
            size="sm"
            variant="secondary"
            disabled={frameIdx >= series.frame_count - 1}
            onClick={() => setFrameIdx((n) => Math.min(series.frame_count - 1, n + 1))}
          >
            Next slice
          </Button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Button size="sm" onClick={() => { setFitMode(false); setScale((s) => Math.min(8, s * 1.25)); }}>
            Zoom +
          </Button>
          <Button size="sm" onClick={() => { setFitMode(false); setScale((s) => Math.max(0.2, s / 1.25)); }}>
            Zoom −
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRotation((r) => (r + 90) % 360)}>
            Rotate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setFitMode(true);
              setOffset({ x: 0, y: 0 });
              setScale(1);
            }}
          >
            Fit
          </Button>
          <Button size="sm" variant="secondary" onClick={resetView}>
            Reset
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void toggleFullscreen()}>
            Fullscreen
          </Button>
        </div>

        <div
          ref={containerRef}
          style={{
            position: 'relative',
            background: '#0b1220',
            borderRadius: 8,
            overflow: 'hidden',
            touchAction: 'none',
            minHeight: 280,
          }}
        >
          {frameLoading ? (
            <div style={{ padding: '2rem', color: '#cbd5e1' }}>Loading frame…</div>
          ) : null}
          {frameError ? (
            <div style={{ padding: '2rem', color: '#fca5a5' }}>{frameError}</div>
          ) : null}
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', cursor: fitMode ? 'default' : 'grab' }}
            onPointerDown={(e) => {
              if (fitMode) setFitMode(false);
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              if (!d) return;
              setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
            onWheel={(e) => {
              e.preventDefault();
              setFitMode(false);
              setScale((s) => Math.min(8, Math.max(0.2, s * (e.deltaY < 0 ? 1.1 : 0.9))));
            }}
          />
        </div>
        <Text size="caption" tone="secondary">
          Drag to pan · scroll to zoom · frames are authorized private streams (no public URLs).
          {session.sandbox ? ' Sandbox synthetic frames.' : ''}
        </Text>
      </Card>
    </div>
  );
}
