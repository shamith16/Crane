import type { Component } from "solid-js";

interface CraneIconProps {
  size?: number;
  class?: string;
}

const CraneIcon: Component<CraneIconProps> = (props) => {
  const s = () => props.size ?? 20;

  return (
    <svg
      width={s()}
      height={s()}
      viewBox="0 0 120 120"
      fill="none"
      class={props.class}
    >
      <g transform="translate(120,0) scale(-1,1)">
      {/* Column */}
      <rect x="45" y="2" width="20" height="55" rx="1.5" fill="#4B4B4B" />
      <rect x="47" y="4" width="16" height="51" rx="0.7" fill="#5A5A5A" />
      <circle cx="51.5" cy="8.5" r="1.5" fill="#3A3A3A" />
      <circle cx="58.5" cy="8.5" r="1.5" fill="#3A3A3A" />

      {/* Middle housing */}
      <rect x="36" y="54" width="28" height="14" rx="1.2" fill="currentColor" />
      <rect x="36" y="66" width="28" height="3" rx="1.2" fill="currentColor" opacity="0.75" />

      {/* Hook */}
      <path
        d="M36 66 L36 96 Q36 106 46 106 L56 106 Q66 106 66 96 L66 76 L60 76 L60 94 Q60 100 54 100 L48 100 Q42 100 42 94 L42 66 Z"
        fill="currentColor"
      />

      {/* Serif */}
      <path d="M36 100 L36 106 L42 106 Z" fill="currentColor" opacity="0.75" />
      </g>
    </svg>
  );
};

export default CraneIcon;
