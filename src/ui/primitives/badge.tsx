import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, Info, PencilLine, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm font-medium",
  {
    variants: {
      variant: {
        published: "bg-published-bg text-published-text",
        draft: "bg-draft-bg text-draft-text",
        danger: "bg-danger-bg text-danger-text",
        info: "bg-info-bg text-info-text",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const ICONS = {
  published: CircleCheck,
  draft: PencilLine,
  danger: TriangleAlert,
  info: Info,
} as const;

export type BadgeVariant = keyof typeof ICONS;

export type BadgeProps = VariantProps<typeof badgeVariants> & {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
};

/**
 * Status wird nie allein ueber Farbe getragen (REQ-NF-004): jedes Badge zeigt
 * Icon UND Text. Das Icon ist dekorativ, die Bedeutung steht im Text.
 */
export function Badge({ variant = "info", className, children }: BadgeProps) {
  const Icon = ICONS[variant];

  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </span>
  );
}
