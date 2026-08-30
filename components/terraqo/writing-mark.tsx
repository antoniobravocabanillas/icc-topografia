import type { SVGProps } from "react";

/** Marca editorial propia de Terraqo: cursor, trazo y confirmacion en un solo simbolo. */
export function TerraqoWritingMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.2 17.8 8 12.2l7.9-7.9 3.8 3.8-7.9 7.9-5.6 1.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m14.6 5.6 3.8 3.8M8 12.2l3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 20h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="18.5" cy="17.5" r="2.25" fill="currentColor" />
    </svg>
  );
}
