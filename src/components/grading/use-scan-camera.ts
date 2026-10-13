"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  cameraFailure,
  scanConstraints,
  stopCameraStream,
} from "@/lib/grading/scan-camera";

export function useScanCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const stream = useRef<MediaStream | null>(null);
  const attempt = useRef(0);
  const mounted = useRef(true);
  const [status, setStatus] = useState<
    "idle" | "requesting" | "live" | "error"
  >("idle");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const invalidateRequests = useCallback(() => {
    attempt.current++;
  }, []);
  const stop = useCallback(() => {
    invalidateRequests();
    stopCameraStream(stream.current);
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    setStatus("idle");
  }, [invalidateRequests, videoRef]);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", stop);
    return () => {
      mounted.current = false;
      invalidateRequests();
      stopCameraStream(stream.current);
      stream.current = null;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", stop);
    };
  }, [stop, invalidateRequests]);
  async function start(facing: "environment" | "user") {
    stop();
    setError("");
    if (!window.isSecureContext) {
      setStatus("error");
      setError(
        "Для камеры нужен HTTPS. Откройте защищённую версию сайта или выберите готовое фото.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError(
        "Этот браузер не поддерживает камеру. Выберите готовое фото или откройте сайт в другом браузере.",
      );
      return;
    }
    const id = ++attempt.current;
    setStatus("requesting");
    let acquired: MediaStream | null = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia(
        scanConstraints(facing),
      );
      if (!mounted.current || id !== attempt.current) {
        stopCameraStream(acquired);
        return;
      }
      const element = videoRef.current;
      if (!element) throw new Error("videoRef unavailable");
      stream.current = acquired;
      element.srcObject = acquired;
      for (const track of acquired.getVideoTracks())
        track.addEventListener(
          "ended",
          () => {
            if (!mounted.current || stream.current !== acquired) return;
            stop();
            setStatus("error");
            setError(
              "Камера отключилась. Повторно откройте камеру или выберите фото.",
            );
          },
          { once: true },
        );
      await element.play();
      if (!mounted.current || id !== attempt.current) {
        stopCameraStream(acquired);
        return;
      }
      setStatus("live");
      setReady(element.readyState >= 2);
    } catch (failure) {
      stopCameraStream(acquired);
      if (!mounted.current || id !== attempt.current) return;
      stream.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus("error");
      setReady(false);
      setError(cameraFailure(failure));
    }
  }
  return {
    status,
    ready,
    error,
    start,
    stop,
    markReady: () => {
      if (
        stream.current &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      )
        setReady(true);
    },
  };
}
