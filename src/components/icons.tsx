import type { ReactNode } from "react";

const Icon = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Icons = {
  hand: (
    <Icon>
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5v-8a1.5 1.5 0 0 1 3 0V12" />
      <path d="M14 5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M17 7.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a7 7 0 0 1-5-2.5L4.3 15a1.6 1.6 0 0 1 2.4-2.1L8 14" />
    </Icon>
  ),
  selection: (
    <Icon>
      <path d="M6 3l12 9-5.5 1L9.5 19z" />
    </Icon>
  ),
  rectangle: (
    <Icon>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
    </Icon>
  ),
  diamond: (
    <Icon>
      <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />
    </Icon>
  ),
  ellipse: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
    </Icon>
  ),
  arrow: (
    <Icon>
      <path d="M5 19L19 5M10 5h9v9" />
    </Icon>
  ),
  line: (
    <Icon>
      <path d="M5 19L19 5" />
    </Icon>
  ),
  freedraw: (
    <Icon>
      <path d="M4 20c2-1 3.5-1 4.5-2.5L19 7a2.1 2.1 0 0 0-3-3L5.5 14.5C4 16 4 18 4 20z" />
      <path d="M14 6l3 3" />
    </Icon>
  ),
  text: (
    <Icon>
      <path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6" />
    </Icon>
  ),
  eraser: (
    <Icon>
      <path d="M8.5 20H20M4.6 14.6l9-9a2 2 0 0 1 2.8 0l2.5 2.5a2 2 0 0 1 0 2.8L11 19H8.5l-3.9-3.9a.8.8 0 0 1 0-.5z" />
      <path d="M9 10l5 5" />
    </Icon>
  ),
  lock: (
    <Icon>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  ),
  unlock: (
    <Icon>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </Icon>
  ),
  menu: (
    <Icon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  ),
  undo: (
    <Icon>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  ),
  redo: (
    <Icon>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </Icon>
  ),
  minus: (
    <Icon>
      <path d="M6 12h12" />
    </Icon>
  ),
  plus: (
    <Icon>
      <path d="M12 6v12M6 12h12" />
    </Icon>
  ),
  trash: (
    <Icon>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  ),
  duplicate: (
    <Icon>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  ),
  open: (
    <Icon>
      <path d="M4 19V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1M4 19l3-8h15l-3 8z" />
    </Icon>
  ),
  save: (
    <Icon>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Icon>
  ),
  image: (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M21 16l-5-5-8 8" />
    </Icon>
  ),
  sun: (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  ),
  moon: (
    <Icon>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </Icon>
  ),
  grid: (
    <Icon>
      <path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16" />
    </Icon>
  ),
  help: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
    </Icon>
  ),
  clear: (
    <Icon>
      <path d="M4 7h16M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  ),
  close: (
    <Icon>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  ),
  copy: (
    <Icon>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  ),
  bringFront: (
    <Icon>
      <path d="M12 20V8M7 12l5-5 5 5M5 4h14" />
    </Icon>
  ),
  bringForward: (
    <Icon>
      <path d="M12 19V6M7 11l5-5 5 5" />
    </Icon>
  ),
  sendBackward: (
    <Icon>
      <path d="M12 5v13M7 13l5 5 5-5" />
    </Icon>
  ),
  sendBack: (
    <Icon>
      <path d="M12 4v12M7 12l5 5 5-5M5 20h14" />
    </Icon>
  ),
  group: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
      <rect x="7" y="7" width="6" height="6" rx="1" />
      <rect x="11" y="11" width="6" height="6" rx="1" />
    </Icon>
  ),
  ungroup: (
    <Icon>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </Icon>
  ),
};
