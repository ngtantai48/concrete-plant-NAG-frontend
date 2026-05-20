"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Factory,
  Fuel,
  Info,
  LoaderCircle,
  LucideIcon,
  MapPinned,
  MoreHorizontal,
  Pin,
  Route,
  Send,
  Sparkles,
  Table2,
  Truck,
  User,
  Wrench,
  X,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  alert: AlertTriangle,
  bar: BarChart3,
  chart: BarChart3,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  clock: Clock,
  factory: Factory,
  fuel: Fuel,
  gantt: Route,
  info: Info,
  loader: LoaderCircle,
  map: MapPinned,
  moreH: MoreHorizontal,
  pin: Pin,
  send: Send,
  sparkles: Sparkles,
  table: Table2,
  tool: Wrench,
  truck: Truck,
  user: User,
  x: X,
};

type RenderIconProps = {
  name?: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
};

export function RenderIcon({
  name = "sparkles",
  size = 16,
  className,
  strokeWidth = 2,
  "aria-hidden": ariaHidden = true,
}: RenderIconProps) {
  const Icon = iconMap[name] ?? CircleHelp;
  return (
    <Icon
      aria-hidden={ariaHidden}
      className={className}
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}

