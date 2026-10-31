import { clsx } from "clsx";

export interface NumberTickerProps {
  value: number;
  prefix?: string;
  suffix?: string;
  format?: Intl.NumberFormatOptions;
  formatter?: (value: number) => string;
  className?: string;
}

export function NumberTicker({
  value,
  prefix = "",
  suffix = "",
  format,
  formatter,
  className,
}: NumberTickerProps) {
  const formatted = formatter
    ? formatter(value)
    : new Intl.NumberFormat("en-US", format).format(value);
  return (
    <span
      className={clsx("hub-number", className)}
    >
      <span>{prefix}</span>
      <span className="hub-number-window">
        <span key={formatted} className="hub-number-value lg-number-enter">
          {formatted}
        </span>
      </span>
      <span>{suffix}</span>
    </span>
  );
}
