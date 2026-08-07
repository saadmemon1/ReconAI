"use client"

import React, { useEffect, useState } from "react"
import { motion, MotionConfig } from "framer-motion"
import Link from "next/link"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  name: string
  url: string
  icon: LucideIcon
}

interface NavBarProps {
  items: NavItem[]
  className?: string
  /** Controlled active item name — falls back to internal state when omitted. */
  value?: string
  onChange?: (name: string) => void
  /** horizontal = floating pill (fixed bottom on mobile, top on sm+);
      vertical = stacked items for a sidebar rail. */
  orientation?: "horizontal" | "vertical"
  /** vertical only: hide item labels (icon-only rail) */
  collapsed?: boolean
}

export function NavBar({
  items,
  className,
  value,
  onChange,
  orientation = "horizontal",
  collapsed = false,
}: NavBarProps) {
  const [innerActive, setInnerActive] = useState(items[0]?.name ?? "")
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const activeTab = value ?? innerActive
  const vertical = orientation === "vertical"

  return (
    // MotionConfig reducedMotion="user" disables the lamp slide for
    // prefers-reduced-motion (app-wide convention).
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          vertical
            ? "static left-auto translate-x-0 pt-0 mb-0"
            : "fixed bottom-0 sm:top-0 left-1/2 -translate-x-1/2 z-50 mb-6 sm:pt-6",
          className,
        )}
      >
        <div
          className={cn(
            vertical
              ? "flex flex-col items-stretch gap-1"
              : "flex items-center gap-3 bg-background/5 border border-border backdrop-blur-lg py-1 px-1 rounded-full shadow-lg",
          )}
        >
          {items.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.name

            return (
              <Link
                key={item.name}
                href={item.url}
                onClick={() => {
                  if (onChange) onChange(item.name)
                  else setInnerActive(item.name)
                }}
                className={cn(
                  "relative cursor-pointer text-sm transition-colors text-foreground/80 hover:text-primary",
                  vertical
                    ? cn(
                        "flex items-center gap-3 rounded-lg px-4 py-2.5 font-medium",
                        collapsed ? "justify-center" : "justify-center md:justify-start",
                      )
                    : "px-6 py-2 rounded-full font-semibold",
                  isActive && "bg-muted text-primary",
                )}
              >
                <Icon size={18} strokeWidth={2.5} className="shrink-0" />
                <span
                  className={
                    vertical ? (collapsed ? "hidden" : "hidden md:inline") : "hidden md:inline"
                  }
                >
                  {item.name}
                </span>
                {isActive && (
                  <motion.div
                    layoutId={vertical ? "lamp-v" : "lamp"}
                    className={cn(
                      "absolute",
                      vertical
                        ? // calc position instead of -translate-y-1/2: framer's
                          // layout animation owns the transform, which would
                          // clobber the CSS translate and misplace the lamp
                          "left-0 top-[calc(50%-12px)] h-6 w-1.5 rounded-r-full bg-primary"
                        : "inset-0 w-full bg-primary/5 rounded-full -z-10",
                    )}
                    initial={false}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 30,
                    }}
                  >
                    {vertical ? (
                      <div className="absolute -left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-primary/40 blur-md" />
                    ) : (
                      <>
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-t-full">
                          <div className="absolute w-12 h-6 bg-primary/20 rounded-full blur-md -top-2 -left-2" />
                          <div className="absolute w-8 h-6 bg-primary/20 rounded-full blur-md -top-1" />
                          <div className="absolute w-4 h-4 bg-primary/20 rounded-full blur-sm top-0 left-2" />
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </MotionConfig>
  )
}
