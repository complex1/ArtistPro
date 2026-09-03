const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a1622"/>
      <stop offset="1" stop-color="#0f2436"/>
    </linearGradient>
    <linearGradient id="n" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect x="3" y="3" width="90" height="90" rx="20" fill="url(#g)" stroke="url(#n)" stroke-width="2"/>
  <g fill="url(#n)">
    <rect x="24" y="24" width="18" height="18" rx="4"/>
    <rect x="54" y="24" width="18" height="18" rx="4" opacity="0.55"/>
    <rect x="24" y="54" width="18" height="18" rx="4" opacity="0.55"/>
    <rect x="54" y="54" width="18" height="18" rx="4"/>
  </g>
</svg>`;

export const DEFAULT_PROFILE_IMAGE =
  "data:image/svg+xml;utf8," + encodeURIComponent(SVG);
