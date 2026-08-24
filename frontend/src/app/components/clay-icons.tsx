import React from "react";

export interface ClayIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* ─────────────────────────────────────────────────────────────────────────────
   0. BRAND LOGO — 3D Lavender 5-Petal Flower with Gold Bead Center
   ───────────────────────────────────────────────────────────────────────────── */
export function ClayAuraFlowerIcon({ size = 38, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(160, 135, 225, 0.35))", ...style }}
    >
      <defs>
        <linearGradient id="petalGrad" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E0D3FA" />
          <stop offset="40%" stopColor="#CBB7F5" />
          <stop offset="100%" stopColor="#A88DEB" />
        </linearGradient>
        <radialGradient id="centerGoldBead" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF4D0" />
          <stop offset="45%" stopColor="#F9DA8A" />
          <stop offset="100%" stopColor="#E2A632" />
        </radialGradient>
      </defs>

      {/* 5 Inflated Clay Petals */}
      <circle cx="24" cy="14" r="8.5" fill="url(#petalGrad)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <circle cx="33.5" cy="21" r="8.5" fill="url(#petalGrad)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <circle cx="30" cy="32.5" r="8.5" fill="url(#petalGrad)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <circle cx="18" cy="32.5" r="8.5" fill="url(#petalGrad)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <circle cx="14.5" cy="21" r="8.5" fill="url(#petalGrad)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />

      {/* Petal Highlights */}
      <ellipse cx="23" cy="10.5" rx="3.5" ry="1.8" fill="#FFFFFF" fillOpacity="0.75" />
      <ellipse cx="33" cy="17" rx="3" ry="1.5" transform="rotate(35 33 17)" fill="#FFFFFF" fillOpacity="0.6" />

      {/* Center Spherical Gold Bead */}
      <circle cx="24" cy="24" r="6.5" fill="url(#centerGoldBead)" stroke="#FFFFFF" strokeWidth="1.2" />
      <circle cx="22" cy="22" r="1.8" fill="#FFFFFF" fillOpacity="0.9" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR ICONS (9 Items) — Handcrafted 3D Tactile Clay SVGs
   ───────────────────────────────────────────────────────────────────────────── */

// 1. Home / Dashboard (White/Lavender 3D Home on active pill)
export function ClayHomeIcon({ size = 20, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <path d="M4 11L11.29 4.44C11.69 4.08 12.31 4.08 12.71 4.44L20 11" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10.5V18.5C6 19.33 6.67 20 7.5 20H16.5C17.33 20 18 19.33 18 18.5V10.5" fill="#FAF8FF" />
      <path d="M10 20V14.5C10 14.22 10.22 14 10.5 14H13.5C13.78 14 14 14.22 14 14.5V20" fill="#9E7EE6" />
    </svg>
  );
}

// 2. Chat (3D Vibrant Blue-Lavender Speech Bubble with 3 white dots)
export function ClayChatSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideChatGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#70B8F8" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <path
        d="M4 12C4 7.58 7.58 4 12 4C16.42 4 20 7.58 20 12C20 16.42 16.42 20 12 20C10.6 20 9.2 19.6 8 18.9L4.5 19.5L5.4 16.2C4.5 15 4 13.5 4 12Z"
        fill="url(#sideChatGrad)"
      />
      <ellipse cx="10" cy="7.5" rx="4" ry="1.5" transform="rotate(-15 10 7.5)" fill="#FFFFFF" fillOpacity="0.75" />
      <circle cx="8.5" cy="12" r="1.1" fill="#FFFFFF" />
      <circle cx="12" cy="12" r="1.1" fill="#FFFFFF" />
      <circle cx="15.5" cy="12" r="1.1" fill="#FFFFFF" />
    </svg>
  );
}

// 3. Voice (3D Magenta/Pink Waveform Bars)
export function ClayVoiceSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideVoiceGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="100%" stopColor="#DB2777" />
        </linearGradient>
      </defs>
      <rect x="4" y="9" width="2.4" height="6" rx="1.2" fill="url(#sideVoiceGrad)" />
      <rect x="8.5" y="6" width="2.4" height="12" rx="1.2" fill="url(#sideVoiceGrad)" />
      <rect x="13" y="4" width="2.4" height="16" rx="1.2" fill="url(#sideVoiceGrad)" />
      <rect x="17.5" y="8" width="2.4" height="8" rx="1.2" fill="url(#sideVoiceGrad)" />
    </svg>
  );
}

// 4. Face-to-Face (3D Purple Camera with Lens)
export function ClayCameraSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideCamGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <path d="M4 8C4 6.9 4.9 6 6 6H7.5L9 4H15L16.5 6H18C19.1 6 20 6.9 20 8V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V8Z" fill="url(#sideCamGrad)" />
      <ellipse cx="12" cy="7.5" rx="5" ry="1.2" fill="#FFFFFF" fillOpacity="0.6" />
      <circle cx="12" cy="12.5" r="3.6" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="12" cy="12.5" r="2.2" fill="#5B21B6" />
      <circle cx="11.2" cy="11.5" r="0.7" fill="#FFFFFF" />
    </svg>
  );
}

// 5. Memory (3D Coral-Red Heart)
export function ClayHeartSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideHeartGrad" x1="3" y1="4" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
      </defs>
      <path
        d="M12 20.5C11.6 20.5 11.2 20.3 10.9 20C6.4 15.8 3.5 12.9 3.5 9.5C3.5 6.7 5.7 4.5 8.5 4.5C10.1 4.5 11.6 5.3 12 6.5C12.4 5.3 13.9 4.5 15.5 4.5C18.3 4.5 20.5 6.7 20.5 9.5C20.5 12.9 17.6 15.8 13.1 20C12.8 20.3 12.4 20.5 12 20.5Z"
        fill="url(#sideHeartGrad)"
      />
      <ellipse cx="8" cy="7.5" rx="2" ry="1" transform="rotate(-35 8 7.5)" fill="#FFFFFF" fillOpacity="0.75" />
    </svg>
  );
}

// 6. Emotion (3D Tactile Golden-Yellow Clay Smile)
export function ClaySmileySidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <radialGradient id="sideSmileGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF2B2" />
          <stop offset="45%" stopColor="#FBC02D" />
          <stop offset="100%" stopColor="#E65100" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.5" fill="url(#sideSmileGrad)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
      {/* Curved Serene Eyes */}
      <path d="M7.8 9.8C8.5 8.8 9.8 8.8 10.5 9.8" stroke="#5D3800" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.5 9.8C14.2 8.8 15.5 8.8 16.2 9.8" stroke="#5D3800" strokeWidth="1.4" strokeLinecap="round" />
      {/* Calm Smile */}
      <path d="M9.2 13.5C10.2 15.2 13.8 15.2 14.8 13.5" stroke="#5D3800" strokeWidth="1.5" strokeLinecap="round" />
      {/* Soft Blushing Cheeks */}
      <circle cx="7.5" cy="12" r="1.4" fill="#FF8A80" fillOpacity="0.75" />
      <circle cx="16.5" cy="12" r="1.4" fill="#FF8A80" fillOpacity="0.75" />
      {/* Gloss Highlight */}
      <ellipse cx="9.5" cy="6" rx="3" ry="1.2" transform="rotate(-20 9.5 6)" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
}

// 7. Analytics (3D Rose-Red Bar Chart)
export function ClayAnalyticsSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideBarGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FB7185" />
          <stop offset="100%" stopColor="#E11D48" />
        </linearGradient>
      </defs>
      <rect x="4" y="12" width="3.4" height="8" rx="1.7" fill="url(#sideBarGrad)" />
      <rect x="10.3" y="8" width="3.4" height="12" rx="1.7" fill="url(#sideBarGrad)" />
      <rect x="16.6" y="4" width="3.4" height="16" rx="1.7" fill="url(#sideBarGrad)" />
    </svg>
  );
}

// 8. Interests (3D Golden Star)
export function ClayStarSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideStarGrad" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>
      </defs>
      <path
        d="M12 3.5L14.5 8.8L20.2 9.5L16 13.4L17.1 19L12 16.2L6.9 19L8 13.4L3.8 9.5L9.5 8.8L12 3.5Z"
        fill="url(#sideStarGrad)"
        stroke="#FFFFFF"
        strokeWidth="0.8"
      />
      <ellipse cx="11" cy="7" rx="1.5" ry="0.8" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
}

// 9. Settings (3D Lavender/Slate Gear)
export function ClaySettingsSidebarIcon({ size = 19, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <linearGradient id="sideGearGrad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="7.5" fill="url(#sideGearGrad)" />
      <circle cx="12" cy="12" r="3" fill="#FAF8FF" />
      <circle cx="12" cy="3.5" r="1.5" fill="#8B5CF6" />
      <circle cx="12" cy="20.5" r="1.5" fill="#8B5CF6" />
      <circle cx="3.5" cy="12" r="1.5" fill="#8B5CF6" />
      <circle cx="20.5" cy="12" r="1.5" fill="#8B5CF6" />
      <circle cx="6" cy="6" r="1.2" fill="#8B5CF6" />
      <circle cx="18" cy="18" r="1.2" fill="#8B5CF6" />
      <circle cx="6" cy="18" r="1.2" fill="#8B5CF6" />
      <circle cx="18" cy="6" r="1.2" fill="#8B5CF6" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TOP BAR ICONS: Sun Button & Search Magnifier
   ───────────────────────────────────────────────────────────────────────────── */

// 3D Sun Icon (Theme/Mood button)
export function ClaySunIcon({ size = 20, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <defs>
        <radialGradient id="sunCenterGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF9C4" />
          <stop offset="40%" stopColor="#FDD835" />
          <stop offset="100%" stopColor="#F57F17" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="4.5" fill="url(#sunCenterGrad)" />
      <circle cx="10.8" cy="10.8" r="1.2" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="12" cy="3.5" r="1.2" fill="#FDD835" />
      <circle cx="12" cy="20.5" r="1.2" fill="#FDD835" />
      <circle cx="3.5" cy="12" r="1.2" fill="#FDD835" />
      <circle cx="20.5" cy="12" r="1.2" fill="#FDD835" />
      <circle cx="6" cy="6" r="1.2" fill="#FDD835" />
      <circle cx="18" cy="18" r="1.2" fill="#FDD835" />
      <circle cx="6" cy="18" r="1.2" fill="#FDD835" />
      <circle cx="18" cy="6" r="1.2" fill="#FDD835" />
    </svg>
  );
}

// 3D Magnifying Glass
export function ClaySearchIcon({ size = 18, className = "", style = {} }: ClayIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      <circle cx="10.5" cy="10.5" r="5.5" stroke="#9E98AA" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M15 15L19 19" stroke="#9E98AA" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   3D CLAY VECTOR ELEMENTS (Replaces generic emojis across dashboard)
   ───────────────────────────────────────────────────────────────────────────── */

// 1. 3D Clay Waving Hand (Greeting Hero)
export function ClayWavingHandIcon({ size = 26, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", filter: "drop-shadow(0 2px 4px rgba(220,160,30,0.3))", ...style }}
    >
      <defs>
        <radialGradient id="waveHandGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF3C4" />
          <stop offset="45%" stopColor="#FBC02D" />
          <stop offset="100%" stopColor="#F57F17" />
        </radialGradient>
      </defs>
      {/* Motion Wave Lines */}
      <path d="M4 10C3 13 3 17 5 19" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2 13C1.5 15 1.5 17 2.5 18.5" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      {/* 3D Inflated Palm & Fingers */}
      <path
        d="M13 14V8C13 6.9 13.9 6 15 6C16.1 6 17 6.9 17 8V13M17 11V7C17 5.9 17.9 5 19 5C20.1 5 21 5.9 21 7V13M21 11.5V9C21 7.9 21.9 7 23 7C24.1 7 25 7.9 25 9V17C25 22 21 26 16 26C11 26 8 22.5 8 18.5V16C8 14.9 8.9 14 10 14C11.1 14 12 14.9 12 16V17"
        fill="url(#waveHandGrad)"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <ellipse cx="14" cy="9" rx="1.2" ry="0.6" fill="#FFFFFF" fillOpacity="0.9" />
    </svg>
  );
}

// 2. 3D Calm Serene Face (Current Emotion Tile)
export function ClayCalmFaceIcon({ size = 32, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 3px 6px rgba(220,150,20,0.35))", ...style }}
    >
      <defs>
        <radialGradient id="calmFaceSpherical" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF4C8" />
          <stop offset="40%" stopColor="#FDD835" />
          <stop offset="85%" stopColor="#F57F17" />
          <stop offset="100%" stopColor="#E65100" />
        </radialGradient>
      </defs>
      {/* Spherical Clay Face */}
      <circle cx="20" cy="20" r="16.5" fill="url(#calmFaceSpherical)" stroke="#FFFFFF" strokeWidth="1.5" />
      {/* Peaceful Curved Eyes */}
      <path d="M12.5 16C13.8 14.5 16.2 14.5 17.5 16" stroke="#4E342E" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22.5 16C23.8 14.5 26.2 14.5 27.5 16" stroke="#4E342E" strokeWidth="2.2" strokeLinecap="round" />
      {/* Gentle Smiling Mouth */}
      <path d="M15.5 22.5C17 25 23 25 24.5 22.5" stroke="#4E342E" strokeWidth="2.2" strokeLinecap="round" />
      {/* Soft Blushing Rosy Cheeks */}
      <circle cx="12" cy="20" r="2.8" fill="#FF8A80" fillOpacity="0.75" />
      <circle cx="28" cy="20" r="2.8" fill="#FF8A80" fillOpacity="0.75" />
      {/* Glossy Specular Glint */}
      <ellipse cx="15.5" cy="9.5" rx="5" ry="2" transform="rotate(-20 15.5 9.5)" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
}

// 3. 3D Smiley Donut Center Bead (Today's Insights)
export function ClaySmileyBeadIcon({ size = 22, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <radialGradient id="beadFaceGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF9C4" />
          <stop offset="45%" stopColor="#FDD835" />
          <stop offset="100%" stopColor="#F57F17" />
        </radialGradient>
      </defs>
      <circle cx="14" cy="14" r="12" fill="url(#beadFaceGrad)" stroke="#FFFFFF" strokeWidth="1" />
      <circle cx="10" cy="12" r="1.5" fill="#3E2723" />
      <circle cx="18" cy="12" r="1.5" fill="#3E2723" />
      <path d="M10.5 16.5C11.8 18.5 16.2 18.5 17.5 16.5" stroke="#3E2723" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="11" cy="6.5" rx="3.5" ry="1.2" transform="rotate(-20 11 6.5)" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN 4 INTERACTION CUSHIONS (Wide Tray)
   ───────────────────────────────────────────────────────────────────────────── */

// 1. Chat Cushion Icon — 3D Speech Bubble with 3 Dots
export function ClayChatIcon({ size = 32, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(140, 115, 205, 0.32))", ...style }}
    >
      <defs>
        <linearGradient id="chatBubbleGrad" x1="10" y1="6" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EDE5FB" />
          <stop offset="35%" stopColor="#C7B5F3" />
          <stop offset="100%" stopColor="#A98BE8" />
        </linearGradient>
        <radialGradient id="chatDotGrad" cx="50%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#8C6ED8" />
          <stop offset="100%" stopColor="#5E40AC" />
        </radialGradient>
      </defs>

      <path
        d="M24 8C14.059 8 6 15.163 6 24C6 27.915 7.6 31.488 10.308 34.234C9.56 37.86 7.42 40.82 7.2 41.12C6.88 41.56 7.02 42.16 7.48 42.42C7.72 42.56 8 42.6 8.28 42.56C12.98 41.86 16.94 39.52 19.34 37.94C20.84 38.38 22.39 38.62 24 38.62C33.941 38.62 42 31.457 42 22.62C42 13.783 33.941 8 24 8Z"
        fill="url(#chatBubbleGrad)"
      />
      <ellipse cx="20" cy="14" rx="8" ry="3" transform="rotate(-15 20 14)" fill="#FFFFFF" fillOpacity="0.75" />

      {/* 3 Embossed Clay Dots */}
      <circle cx="16" cy="23" r="2.75" fill="url(#chatDotGrad)" />
      <circle cx="24" cy="23" r="2.75" fill="url(#chatDotGrad)" />
      <circle cx="32" cy="23" r="2.75" fill="url(#chatDotGrad)" />
      <circle cx="15.2" cy="21.8" r="0.85" fill="#FFFFFF" fillOpacity="0.8" />
      <circle cx="23.2" cy="21.8" r="0.85" fill="#FFFFFF" fillOpacity="0.8" />
      <circle cx="31.2" cy="21.8" r="0.85" fill="#FFFFFF" fillOpacity="0.8" />
    </svg>
  );
}

// 2. Voice Mode Cushion Icon — 3D Mint Audio Waveform Bars (5 Vertical Rounded Bars)
export function ClayVoiceWaveBarsIcon({ size = 32, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(35, 140, 115, 0.32))", ...style }}
    >
      <defs>
        <linearGradient id="mintBarGrad" x1="0" y1="8" x2="0" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E2FAF2" />
          <stop offset="35%" stopColor="#BFE6D8" />
          <stop offset="100%" stopColor="#2F9E7E" />
        </linearGradient>
      </defs>

      {/* 5 Vertical Bars: Heights 16, 26, 36, 26, 16 */}
      <rect x="6" y="16" width="5.5" height="16" rx="2.75" fill="url(#mintBarGrad)" />
      <rect x="14.5" y="11" width="5.5" height="26" rx="2.75" fill="url(#mintBarGrad)" />
      <rect x="23" y="6" width="5.5" height="36" rx="2.75" fill="url(#mintBarGrad)" />
      <rect x="31.5" y="11" width="5.5" height="26" rx="2.75" fill="url(#mintBarGrad)" />
      <rect x="40" y="16" width="5.5" height="16" rx="2.75" fill="url(#mintBarGrad)" />

      {/* Specular Highlights */}
      <circle cx="8.75" cy="18.5" r="1.5" fill="#FFFFFF" fillOpacity="0.8" />
      <circle cx="17.25" cy="13.5" r="1.5" fill="#FFFFFF" fillOpacity="0.8" />
      <circle cx="25.75" cy="8.5" r="1.5" fill="#FFFFFF" fillOpacity="0.8" />
      <circle cx="34.25" cy="13.5" r="1.5" fill="#FFFFFF" fillOpacity="0.8" />
      <circle cx="42.75" cy="18.5" r="1.5" fill="#FFFFFF" fillOpacity="0.8" />
    </svg>
  );
}

// 3. Face-to-Face Cushion Icon — 3D Peach Camera Body with Circular Raised Lens
export function ClayFaceCameraIcon({ size = 32, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(210, 100, 80, 0.32))", ...style }}
    >
      <defs>
        <linearGradient id="peachCamGrad3D" x1="8" y1="8" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDEAE3" />
          <stop offset="35%" stopColor="#F7C8BA" />
          <stop offset="100%" stopColor="#E58D76" />
        </linearGradient>
        <radialGradient id="peachLensInner3D" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FCA895" />
          <stop offset="50%" stopColor="#E5735B" />
          <stop offset="100%" stopColor="#AD3B24" />
        </radialGradient>
      </defs>

      {/* Top Shutter Notch */}
      <rect x="18" y="7" width="12" height="6" rx="3" fill="url(#peachCamGrad3D)" />

      {/* Top Right Flash Nub */}
      <circle cx="37" cy="17" r="2.5" fill="#FFE8E2" />
      <circle cx="37" cy="17" r="1.5" fill="#E58D76" />

      {/* Camera Body */}
      <rect x="6" y="11" width="36" height="28" rx="9" fill="url(#peachCamGrad3D)" />
      <ellipse cx="24" cy="14" rx="12" ry="2.5" fill="#FFFFFF" fillOpacity="0.75" />

      {/* Raised Lens Ring */}
      <circle cx="24" cy="25" r="9.5" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="24" cy="25" r="7.5" fill="url(#peachLensInner3D)" />

      {/* Specular Glint */}
      <circle cx="22" cy="23" r="2" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
}

// 4. Memory Cushion Icon — 3D Soft Yellow Cushion with Embossed Coral Heart Center
export function ClayHeartCushionIcon({ size = 32, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(195, 140, 45, 0.32))", ...style }}
    >
      <defs>
        <linearGradient id="heartCushionGrad" x1="12" y1="8" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF3D4" />
          <stop offset="35%" stopColor="#F3D991" />
          <stop offset="100%" stopColor="#DCA842" />
        </linearGradient>
        <radialGradient id="innerHeartRedGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFA69E" />
          <stop offset="50%" stopColor="#F17878" />
          <stop offset="100%" stopColor="#C94444" />
        </radialGradient>
      </defs>

      {/* Outer Heart Pillow */}
      <path
        d="M24 40.5C23.2 40.5 22.4 40.2 21.8 39.6C12.8 31.8 7 26.2 7 19.5C7 13.8 11.4 9.5 17 9.5C20.3 9.5 23.2 11.2 24 13.6C24.8 11.2 27.7 9.5 31 9.5C36.6 9.5 41 13.8 41 19.5C41 26.2 35.2 31.8 26.2 39.6C25.6 40.2 24.8 40.5 24 40.5Z"
        fill="url(#heartCushionGrad)"
      />

      {/* Inner Coral Heart Center */}
      <path
        d="M24 33.5C23.5 33.5 23 33.3 22.6 32.9C16.8 27.7 13 23.9 13 19.3C13 15.5 16 12.5 19.8 12.5C22 12.5 23.8 13.7 24 15.3C24.2 13.7 26 12.5 28.2 12.5C32 12.5 35 15.5 35 19.3C35 23.9 31.2 27.7 25.4 32.9C25 33.3 24.5 33.5 24 33.5Z"
        fill="url(#innerHeartRedGrad)"
      />

      {/* Specular Highlight */}
      <ellipse cx="16.5" cy="15" rx="3.5" ry="2" transform="rotate(-35 16.5 15)" fill="#FFFFFF" fillOpacity="0.75" />
    </svg>
  );
}

// Aliases for compatibility
export const ClayVoiceIcon = ClayVoiceWaveBarsIcon;
export const ClayFaceIcon = ClayFaceCameraIcon;
export const ClayHeartIcon = ClayHeartCushionIcon;

/* ─────────────────────────────────────────────────────────────────────────────
   BOTTOM ROW: Lilac Blob Mascot & 3D Purple Mic Button
   ───────────────────────────────────────────────────────────────────────────── */

// 3D Lilac Blob Character Mascot
export function ClayLilacBlobMascot({ size = 52, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(150, 120, 210, 0.35))", ...style }}
    >
      <defs>
        <linearGradient id="blobGrad" x1="16" y1="8" x2="48" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EDE5FB" />
          <stop offset="35%" stopColor="#C7B5F3" />
          <stop offset="100%" stopColor="#9E7EE6" />
        </linearGradient>
      </defs>

      {/* Lilac Blob Body */}
      <path
        d="M32 8C19 8 13 18 13 36C13 50 20 58 32 58C44 58 51 50 51 36C51 18 45 8 32 8Z"
        fill="url(#blobGrad)"
      />

      {/* Specular Top-Left Highlight */}
      <ellipse cx="26" cy="14" rx="7" ry="3.5" transform="rotate(-20 26 14)" fill="#FFFFFF" fillOpacity="0.7" />

      {/* Eyes: Round Black Beads */}
      <circle cx="26" cy="30" r="2.6" fill="#1C182B" />
      <circle cx="25.2" cy="29.2" r="0.8" fill="#FFFFFF" />

      <circle cx="38" cy="30" r="2.6" fill="#1C182B" />
      <circle cx="37.2" cy="29.2" r="0.8" fill="#FFFFFF" />

      {/* Cute Open Smiling Mouth */}
      <path d="M29 35C29 37.5 30.5 39 32 39C33.5 39 35 37.5 35 35H29Z" fill="#1C182B" />
      <path d="M30.5 36.5C31 37.2 32 37.2 32.5 36.5C32.8 37 32 37.8 31.5 37.8C31 37.8 30.2 37 30.5 36.5Z" fill="#FFA69E" />

      {/* Little Resting Arms / Paws over container edge */}
      <circle cx="16" cy="42" r="4.5" fill="#BCA4EE" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      <circle cx="48" cy="42" r="4.5" fill="#BCA4EE" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
    </svg>
  );
}

// 3D Spherical Purple Microphone Button
export function ClayMicCircleButton({ size = 38, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 8px rgba(120, 85, 200, 0.4))", ...style }}
    >
      <defs>
        <linearGradient id="purpleMicCircle" x1="8" y1="6" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C9B7F7" />
          <stop offset="40%" stopColor="#A88DEB" />
          <stop offset="100%" stopColor="#7B56DB" />
        </linearGradient>
      </defs>

      <circle cx="22" cy="22" r="19" fill="url(#purpleMicCircle)" stroke="#FFFFFF" strokeWidth="1.5" />
      <ellipse cx="18" cy="12" rx="6" ry="2.5" transform="rotate(-25 18 12)" fill="#FFFFFF" fillOpacity="0.65" />

      {/* Mic Icon (White) */}
      <rect x="18" y="11" width="8" height="12" rx="4" fill="#FFFFFF" />
      <path d="M14 19C14 23.4 17.6 27 22 27C26.4 27 30 19 30 19" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 27V32" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 32H27" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   QUICK ACTIONS (4 Items)
   ───────────────────────────────────────────────────────────────────────────── */

export function ClayJournalIcon({ size = 28, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 3px 6px rgba(185, 110, 20, 0.28)) drop-shadow(0 0 2px rgba(255,255,255,0.6))", ...style }}
    >
      <defs>
        <linearGradient id="bookCoverGrad3D" x1="8" y1="6" x2="38" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="35%" stopColor="#F9A825" />
          <stop offset="100%" stopColor="#E65100" />
        </linearGradient>
        <linearGradient id="bookSpineGrad" x1="6" y1="6" x2="16" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF9C4" />
          <stop offset="40%" stopColor="#FBC02D" />
          <stop offset="100%" stopColor="#F57F17" />
        </linearGradient>
      </defs>
      <rect x="10" y="7" width="28" height="34" rx="7" fill="url(#bookCoverGrad3D)" />
      <path d="M10 7C7.2 7 5 9.2 5 12V36C5 38.8 7.2 41 10 41H13V7H10Z" fill="url(#bookSpineGrad)" />
      <rect x="18" y="14" width="16" height="4.5" rx="2.25" fill="#FFFFFF" fillOpacity="0.95" />
      <rect x="36" y="16" width="4.5" height="5" rx="2" fill="#FFA000" />
      <rect x="36" y="24" width="4.5" height="5" rx="2" fill="#FFA000" />
      <path d="M7 11C7 9.5 8 8.5 9.5 8.5C10 8.5 10.5 9 10.5 10V38C10.5 39 10 39.5 9.5 39.5C8 39.5 7 38.5 7 37V11Z" fill="#FFFFFF" fillOpacity="0.65" />
    </svg>
  );
}

export function ClayBreathingIcon({ size = 28, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 2px 5px rgba(25, 120, 95, 0.25)) drop-shadow(0 0 2px rgba(255,255,255,0.6))", ...style }}
    >
      <defs>
        <linearGradient id="leaf3DGrad" x1="10" y1="6" x2="38" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D5F5E3" />
          <stop offset="35%" stopColor="#58D68D" />
          <stop offset="100%" stopColor="#1E8449" />
        </linearGradient>
      </defs>
      <path d="M38 7C22 7 9 18 9 34C9 38 12 41 16 41C32 41 42 27 42 11L38 7Z" fill="url(#leaf3DGrad)" />
      <path d="M13 38C20 32 28 22 36 10" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 30C24 30 27 27 29 25" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.9" />
      <path d="M25 24C29 24 32 21 34 19" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.9" />
      <ellipse cx="29" cy="14" rx="7" ry="3" transform="rotate(-40 29 14)" fill="#FFFFFF" fillOpacity="0.65" />
    </svg>
  );
}

export function ClayFocusIcon({ size = 28, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 2px 5px rgba(35, 90, 190, 0.25)) drop-shadow(0 0 2px rgba(255,255,255,0.6))", ...style }}
    >
      <defs>
        <linearGradient id="targetOuterGrad3D" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4E6F1" />
          <stop offset="35%" stopColor="#5499C7" />
          <stop offset="100%" stopColor="#2471A3" />
        </linearGradient>
        <radialGradient id="bullseyeCenter3D" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#5DADE2" />
          <stop offset="50%" stopColor="#2E86C1" />
          <stop offset="100%" stopColor="#1B4F72" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="17" fill="url(#targetOuterGrad3D)" stroke="#FFFFFF" strokeWidth="2" />
      <circle cx="24" cy="24" r="11.5" fill="#FFFFFF" fillOpacity="0.92" />
      <circle cx="24" cy="24" r="7" fill="url(#bullseyeCenter3D)" />
      <circle cx="22" cy="22" r="2.2" fill="#FFFFFF" fillOpacity="0.9" />
      <path d="M14 16C17 11.5 24 10 29 11.5" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.75" />
    </svg>
  );
}

export function ClayMusicIcon({ size = 28, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 3px 6px rgba(210, 70, 90, 0.28)) drop-shadow(0 0 2px rgba(255,255,255,0.6))", ...style }}
    >
      <defs>
        <linearGradient id="music3DGrad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FADBD8" />
          <stop offset="35%" stopColor="#F1948A" />
          <stop offset="100%" stopColor="#C0392B" />
        </linearGradient>
      </defs>
      <path d="M16 15L34 10V17L16 22V15Z" fill="url(#music3DGrad)" />
      <rect x="15" y="15" width="4.5" height="19" rx="2.25" fill="url(#music3DGrad)" />
      <rect x="33" y="10" width="4.5" height="19" rx="2.25" fill="url(#music3DGrad)" />
      <ellipse cx="13.5" cy="33.5" rx="6" ry="4.8" transform="rotate(-20 13.5 33.5)" fill="url(#music3DGrad)" />
      <ellipse cx="31.5" cy="28.5" rx="6" ry="4.8" transform="rotate(-20 31.5 28.5)" fill="url(#music3DGrad)" />
      <ellipse cx="11.5" cy="32" rx="2" ry="1.2" fill="#FFFFFF" fillOpacity="0.85" />
      <ellipse cx="29.5" cy="27" rx="2" ry="1.2" fill="#FFFFFF" fillOpacity="0.85" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHAT INTERFACE SPECIFIC 3D CLAY ELEMENTS (Matching TARGET Image)
   ───────────────────────────────────────────────────────────────────────────── */

// 1. Mini 3D Aura Robot Avatar (For Assistant Chat Bubbles)
export function ClayAuraAvatar({ size = 38, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 10px rgba(160, 135, 220, 0.28))", flexShrink: 0, ...style }}
    >
      <defs>
        {/* Outer White / Chrome Ring Gradient */}
        <linearGradient id="avatarRingGrad" x1="6" y1="4" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#F5EDF8" />
          <stop offset="100%" stopColor="#D8CCE8" />
        </linearGradient>
        {/* OLED Screen Gradient */}
        <radialGradient id="oledFaceGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#1E192E" />
          <stop offset="55%" stopColor="#0F0C1B" />
          <stop offset="100%" stopColor="#08060F" />
        </radialGradient>
        {/* Cyan Glow Filter */}
        <filter id="cyanEyeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#00E5FF" floodOpacity="0.8" />
        </filter>
      </defs>

      {/* Outer Raised Ceramic Rim */}
      <circle cx="22" cy="22" r="20" fill="url(#avatarRingGrad)" stroke="#FFFFFF" strokeWidth="1.5" />
      
      {/* Specular Highlight on Rim */}
      <ellipse cx="16" cy="7" rx="8" ry="3" transform="rotate(-25 16 7)" fill="#FFFFFF" fillOpacity="0.9" />

      {/* OLED Circular Dark Screen */}
      <circle cx="22" cy="22" r="14" fill="url(#oledFaceGrad)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />

      {/* Inner Screen Gloss Reflection */}
      <path
        d="M12 18C13.5 13 18 10.5 24 11C19 12 14 15 12 18Z"
        fill="#FFFFFF"
        fillOpacity="0.3"
      />

      {/* Cyan Friendly Eyes (Smiling Arcs / Pills) */}
      <path
        d="M16 19.5C16.8 17.8 18.8 17.8 19.6 19.5"
        stroke="#00E5FF"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#cyanEyeGlow)"
      />
      <path
        d="M24.4 19.5C25.2 17.8 27.2 17.8 28 19.5"
        stroke="#00E5FF"
        strokeWidth="2"
        strokeLinecap="round"
        filter="url(#cyanEyeGlow)"
      />

      {/* Tiny Cyan Smile */}
      <path
        d="M20 23.5C21 25.2 23 25.2 24 23.5"
        stroke="#00E5FF"
        strokeWidth="1.8"
        strokeLinecap="round"
        filter="url(#cyanEyeGlow)"
      />

      {/* Rosy Cheek Glows */}
      <circle cx="15" cy="22.5" r="1.5" fill="#38BDF8" fillOpacity="0.4" />
      <circle cx="29" cy="22.5" r="1.5" fill="#38BDF8" fillOpacity="0.4" />
    </svg>
  );
}

export const ClayAuraAvatarBead = ClayAuraAvatar;


// 2. 3D Purple Music Tile Icon (For Bottom Music Bar)
export function ClayMusicTileIcon({ size = 44, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 4px 10px rgba(160, 135, 225, 0.35))", flexShrink: 0, ...style }}
    >
      <defs>
        <linearGradient id="musicTileGrad" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D8CBFA" />
          <stop offset="40%" stopColor="#C4B0F3" />
          <stop offset="100%" stopColor="#9E7EE6" />
        </linearGradient>
      </defs>

      {/* Rounded Purple Clay Cushion */}
      <rect x="3" y="3" width="42" height="42" rx="16" fill="url(#musicTileGrad)" stroke="#FFFFFF" strokeWidth="1.5" />

      {/* Top Specular Glint */}
      <ellipse cx="18" cy="9" rx="10" ry="3.5" transform="rotate(-15 18 9)" fill="#FFFFFF" fillOpacity="0.75" />

      {/* 3D White Musical Notes */}
      <path
        d="M17 18L33 13.5V21L17 25.5V18Z"
        fill="#FFFFFF"
        filter="drop-shadow(0 1.5px 2px rgba(90, 60, 150, 0.3))"
      />
      <rect x="16.5" y="18" width="3.5" height="15" rx="1.75" fill="#FFFFFF" />
      <rect x="30.5" y="13.5" width="3.5" height="15" rx="1.75" fill="#FFFFFF" />
      <ellipse cx="15.5" cy="32.5" rx="4.5" ry="3.5" transform="rotate(-20 15.5 32.5)" fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(90, 60, 150, 0.25))" />
      <ellipse cx="29.5" cy="28" rx="4.5" ry="3.5" transform="rotate(-20 29.5 28)" fill="#FFFFFF" filter="drop-shadow(0 2px 4px rgba(90, 60, 150, 0.25))" />
    </svg>
  );
}

// 3. Double Checkmarks for User Messages (10:31 AM ✓✓)
export function ClayDoubleCheckIcon({ size = 13, color = "#8F87A0", className = "" }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M1 6.5L4.5 10L11 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 6.5L8.5 9.5L15 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

// 4. 3D Purple Brain Icon (For Active Memory Context Header)
export function ClayBrainIcon({ size = 22, className = "", style = {} }: ClayIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ filter: "drop-shadow(0 2px 5px rgba(123, 86, 219, 0.35))", ...style }}
    >
      <defs>
        <linearGradient id="brainGrad" x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4C5F7" />
          <stop offset="40%" stopColor="#B497F0" />
          <stop offset="100%" stopColor="#7B56DB" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#brainGrad)" stroke="#FFFFFF" strokeWidth="1.2" />
      {/* Specular highlight */}
      <ellipse cx="12" cy="8" rx="5" ry="2" transform="rotate(-20 12 8)" fill="#FFFFFF" fillOpacity="0.75" />
      {/* Brain convolution grooves */}
      <path
        d="M16 8V24M11 11C13 13 13 15 11 17M21 11C19 13 19 15 21 17M10 20C13 21 13 22 11 23M22 20C19 21 19 22 21 23"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

