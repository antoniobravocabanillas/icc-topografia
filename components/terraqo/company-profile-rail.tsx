"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function CompanyProfileRail({ children, label }: { children: ReactNode; label: string }) {
  const railRef = useRef<HTMLDivElement>(null);

  function move(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.82), behavior: "smooth" });
  }

  return (
    <div className="relative min-w-0">
      <div ref={railRef} className="flex min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => move(-1)} aria-label={`Ver anteriores ${label}`} className="grid h-10 w-10 place-items-center rounded-full border border-[#d6dfdc] bg-white text-[#244841] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => move(1)} aria-label={`Ver siguientes ${label}`} className="grid h-10 w-10 place-items-center rounded-full border border-[#d6dfdc] bg-white text-[#244841] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
