"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Base UI-backed dropdown menu, exposing the conventional shadcn-style API:
 * DropdownMenu / DropdownMenuTrigger / DropdownMenuContent /
 * DropdownMenuCheckboxItem. No Radix dependency — uses @base-ui/react/menu
 * which the rest of this codebase already depends on.
 */

const DropdownMenu = MenuPrimitive.Root;

const DropdownMenuTrigger = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof MenuPrimitive.Trigger>) => (
  <MenuPrimitive.Trigger
    className={cn("outline-none", className)}
    {...props}
  >
    {children}
  </MenuPrimitive.Trigger>
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Popup>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Popup> &
    Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset">
>(({ className, align = "start", side = "bottom", sideOffset = 4, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <MenuPrimitive.Positioner align={align} side={side} sideOffset={sideOffset}>
      <MenuPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg outline-none",
          "data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95",
          "data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Positioner>
  </MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <MenuPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm outline-none transition-colors",
      "data-highlighted:bg-muted data-highlighted:text-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="flex size-4 items-center justify-center">
      <MenuPrimitive.CheckboxItemIndicator>
        <CheckIcon className="size-3.5" />
      </MenuPrimitive.CheckboxItemIndicator>
    </span>
    {children}
  </MenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
      "data-highlighted:bg-muted data-highlighted:text-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </MenuPrimitive.Item>
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger };
