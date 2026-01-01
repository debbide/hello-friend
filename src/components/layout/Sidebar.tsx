import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Bot,
  ChevronLeft,
  Settings,
  Sparkles,
  MessageSquareText,
  Rss,
  Wrench,
  Bell,
  ScrollText,
  Send,
  BellRing,
  Timer,
  Flame,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "仪表盘", emoji: "📊" },
  { to: "/ai-chat", icon: MessageSquareText, label: "AI 对话", emoji: "🤖" },
  { to: "/rss", icon: Rss, label: "RSS 订阅", emoji: "📰" },
  { to: "/trending", icon: Flame, label: "热榜聚合", emoji: "🔥" },
  { to: "/price-monitor", icon: TrendingDown, label: "价格监控", emoji: "💰" },
  { to: "/tools", icon: Wrench, label: "实用工具", emoji: "🛠️" },
  { to: "/reminders", icon: Bell, label: "备忘提醒", emoji: "⏰" },
  { to: "/scheduled-tasks", icon: Timer, label: "定时任务", emoji: "🕐" },
  { to: "/logs", icon: ScrollText, label: "实时日志", emoji: "📜" },
  { to: "/quick-send", icon: Send, label: "快捷发送", emoji: "📤" },
  { to: "/notifications", icon: BellRing, label: "通知中心", emoji: "🔔" },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        "bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 relative shadow-sm",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-soft">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-base text-sidebar-foreground">TG Bot</h1>
              <p className="text-xs text-sidebar-muted flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                个人助手
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                isActive
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              {collapsed ? (
                <span className="text-lg">{item.emoji}</span>
              ) : (
                <>
                  <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "" : "text-sidebar-muted group-hover:text-sidebar-foreground")} />
                  <span className="text-sm font-semibold">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-sidebar-border">
        <NavLink
          to="/settings"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
            location.pathname === "/settings"
              ? "bg-primary text-primary-foreground shadow-soft"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          {collapsed ? (
            <span className="text-lg">⚙️</span>
          ) : (
            <>
              <Settings className="w-5 h-5 flex-shrink-0 text-sidebar-muted group-hover:text-sidebar-foreground" />
              <span className="text-sm font-semibold">设置</span>
            </>
          )}
        </NavLink>
      </div>

      {/* Collapse Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border shadow-soft hover:bg-accent hover:scale-110 transition-transform"
      >
        <ChevronLeft
          className={cn(
            "w-4 h-4 transition-transform text-muted-foreground",
            collapsed && "rotate-180"
          )}
        />
      </Button>
    </aside>
  );
}
