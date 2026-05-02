type LogoVariant = "primary" | "square" | "text";
type LogoTone = "dark" | "light";

const SOURCES: Record<LogoTone, Record<LogoVariant, string>> = {
  // `dark` = the asset designed for placement on a LIGHT background.
  dark: {
    primary: "/logos/psa-primary.svg",
    square: "/logos/psa-square.svg",
    text: "/logos/psa-text.svg",
  },
  // `light` = the asset designed for placement on a DARK background.
  light: {
    primary: "/logos/psa-primary-light.svg",
    square: "/logos/psa-square-light.svg",
    text: "/logos/psa-text-light.svg",
  },
};

export function Logo({
  variant = "primary",
  tone = "dark",
  height = 32,
  alt = "PowerSpeak Academy",
  style,
}: {
  variant?: LogoVariant;
  /**
   * Pass `tone="light"` when the logo sits on a dark navy / royal blue / pink
   * background so we use the light-on-dark asset instead of the standard mark.
   */
  tone?: LogoTone;
  height?: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  const src = SOURCES[tone][variant];
  return <img src={src} alt={alt} style={{ height, width: "auto", ...style }} />;
}
