"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AutoScanGate,
  grayPixels,
  analyzeScan,
  hashDistance,
  type AutoScanState,
} from "@/lib/grading/scan-analysis";
import { captureScanFrame } from "@/lib/grading/scan-camera";
import type { LocalPageMetadata } from "@/lib/grading/local-pages";
export function useAutoScan(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  knownHashes: string[],
  onCapture: (blob: Blob, metadata: LocalPageMetadata) => Promise<void>,
  paused = false,
) {
  const [state, setState] = useState<AutoScanState>("background"),
    [error, setError] = useState("");
  const gate = useRef(new AutoScanGate()),
    callback = useRef(onCapture),
    known = useRef(knownHashes),
    capturing = useRef(false),
    pause = useRef(paused);
  useEffect(() => {
    callback.current = onCapture;
    known.current = knownHashes;
    pause.current = paused;
  }, [onCapture, knownHashes, paused]);
  useEffect(() => {
    if (!enabled) return;
    gate.current.reset();
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let cancelled = false,
      failed = false,
      started = false;
    const tick = async () => {
      const video = videoRef.current;
      if (
        cancelled ||
        failed ||
        pause.current ||
        document.hidden ||
        capturing.current ||
        !ctx ||
        !video ||
        video.readyState < 2
      )
        return;
      try {
        if (!started) {
          setError("");
          setState("background");
          started = true;
        }
        ctx.drawImage(video, 0, 0, 160, 120);
        const gray = grayPixels(ctx.getImageData(0, 0, 160, 120).data);
        const observation = gate.current.inspect(
          gray,
          160,
          120,
          performance.now(),
        );
        const duplicate =
          observation.capture &&
          known.current.some(
            (hash) => hashDistance(hash, observation.hash) <= 2,
          );
        setState(duplicate ? "duplicate" : observation.state);
        if (!observation.capture) return;
        capturing.current = true;
        const blob = await captureScanFrame(video);
        if (cancelled) return;
        const quality = analyzeScan(
          gray,
          160,
          120,
          video.videoWidth,
          video.videoHeight,
        );
        if (duplicate) quality.flags.push("possible_duplicate");
        await callback.current(blob, {
          source: "batch_scan",
          fingerprint: observation.hash,
          quality,
        });
        if (!cancelled) {
          gate.current.captured(observation.hash);
          setState("captured");
        }
      } catch (failure) {
        failed = true;
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось снять лист. Выключите и снова включите автосъёмку.",
          );
      } finally {
        capturing.current = false;
      }
    };
    const timer = setInterval(() => void tick(), 180);
    return () => {
      cancelled = true;
      clearInterval(timer);
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [enabled, videoRef]);
  function remember(hash: string) {
    gate.current.captured(hash);
  }
  return { state, error, remember };
}
