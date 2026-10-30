import React, { useEffect, useRef, useState } from "react";

interface PriceFlashProps {
  value: number;
  formatter?: (val: number) => string;
  className?: string;
}

export function PriceFlash({ value, formatter, className = "" }: PriceFlashProps) {
  const prevValueRef = useRef<number>(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      if (value > prevValueRef.current) {
        setFlash("up");
      } else if (value < prevValueRef.current) {
        setFlash("down");
      }
      prevValueRef.current = value;

      const timer = setTimeout(() => {
        setFlash(null);
      }, 700);

      return () => clearTimeout(timer);
    }
  }, [value]);

  const flashClass =
    flash === "up"
      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-1 rounded transition-colors duration-300"
      : flash === "down"
      ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1 rounded transition-colors duration-300"
      : "transition-colors duration-500";

  return (
    <span className={`${flashClass} ${className}`}>
      {formatter ? formatter(value) : value}
    </span>
  );
}

