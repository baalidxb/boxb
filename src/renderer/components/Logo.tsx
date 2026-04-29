interface LogoProps {
  color?: string;
  size?: number;
}

export function Logo({ color = '#D4AF37', size = 40 }: LogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BoxB"
    >
      <polygon points="80,40 116,62 116,104 80,126 44,104 44,62" fill={color} />
      <rect x="44" y="72" width="72" height="7" fill="#000000" />
      <rect x="44" y="92" width="72" height="7" fill="#000000" />
    </svg>
  );
}
