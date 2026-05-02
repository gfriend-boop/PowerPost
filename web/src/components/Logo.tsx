type LogoVariant = "primary" | "square" | "square-light" | "text";

const SOURCES: Record<LogoVariant, string> = {
  primary: "/logos/psa-primary.svg",
  square: "/logos/psa-square.svg",
  // Use on dark / saturated backgrounds (deep navy, royal blue, pink).
  "square-light": "/logos/psa-square-light.svg",
  text: "/logos/psa-text.svg",
};

export function Logo({
  variant = "primary",
  height = 32,
  alt = "PowerSpeak Academy",
  style,
}: {
  variant?: LogoVariant;
  height?: number;
  alt?: string;
  style?: React.CSSProperties;
}) {
  return <img src={SOURCES[variant]} alt={alt} style={{ height, width: "auto", ...style }} />;
}
