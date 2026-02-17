import type { JSX } from "solid-js";

interface Props {
  name: string;
  size?: number;
  class?: string;
  filled?: boolean;
  style?: JSX.CSSProperties;
}

export default function MaterialIcon(props: Props) {
  const fontSize = () => props.size ?? 24;

  return (
    <span
      class={`material-symbols-rounded ${props.class ?? ""}`}
      style={{
        "font-size": `${fontSize()}px`,
        "font-variation-settings": props.filled ? "'FILL' 1" : "'FILL' 0",
        ...props.style,
      }}
    >
      {props.name}
    </span>
  );
}
