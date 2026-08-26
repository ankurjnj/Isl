import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet";
  children: ReactNode;
};

export function Button({ variant = "primary", className, children, ...rest }: Props) {
  return (
    <button className={`btn btn--${variant} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}
