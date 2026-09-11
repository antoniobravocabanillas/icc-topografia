"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** Grows with typing, paste and programmatic edits, then scrolls at a bounded height. */
export const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AutoGrowTextarea(
  { className, onInput, value, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => {
    const field = localRef.current;
    if (!field) return;
    const limit = Math.max(
      96,
      Math.min(
        240,
        (window.visualViewport?.height || window.innerHeight) * 0.3,
      ),
    );
    field.style.height = "auto";
    const height = Math.max(56, Math.min(field.scrollHeight + 2, limit));
    field.style.height = `${height}px`;
    field.style.overflowY = field.scrollHeight > height ? "auto" : "hidden";
  }, []);
  useLayoutEffect(resize, [resize, value]);
  useLayoutEffect(() => {
    const field = localRef.current;
    if (!field) return;
    let frame = 0;
    let lastWidth = field.clientWidth;
    const deferredResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    };
    const observer = new ResizeObserver(() => {
      if (field.clientWidth !== lastWidth) {
        lastWidth = field.clientWidth;
        resize();
      }
    });
    observer.observe(field);
    field.addEventListener("input", resize);
    field.form?.addEventListener("reset", deferredResize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      field.removeEventListener("input", resize);
      field.form?.removeEventListener("reset", deferredResize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [resize]);
  return (
    <textarea
      {...props}
      value={value}
      ref={(node) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className={cn(
        "block min-h-14 w-full resize-none text-base leading-6",
        className,
      )}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
    />
  );
});
