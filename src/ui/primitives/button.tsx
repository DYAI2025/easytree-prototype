import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  // min-h-11/min-w-11 = 44 CSS-Pixel: WCAG 2.5.5. Ohne die Untergrenze war
  // jeder Knopf 40 px hoch und die Monatspfeile 41 px breit (gemessen bei
  // 375 px Viewport, TASK-048).
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded px-4 py-2 font-medium disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-action text-action-contrast",
        secondary: "border border-line bg-surface text-ink",
        ghost: "text-ink hover:bg-canvas",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
