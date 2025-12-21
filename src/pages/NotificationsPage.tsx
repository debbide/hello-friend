import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications } from "@/hooks/useNotifications";
import { Notification } from "@/lib/api/backend";
import { 
  Bell, 
  BellRing, 
  Check, 
  CheckCheck,
  Trash2, 
  Rss, 
  AlertCircle,
  Clock,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";

const NotificationsSkeleton = () => (
  <div className="space-y-6 animate-fade-in">
    <div className="flex items-center justify-between">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-52 mt-2" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
    <Skeleton className="h-10 w-full max-w-md" />
    <Card>
      <CardContent className="p-4 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-accent/30">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);

const NotificationsPage = () => {
  const {
    notifications,
    isLoading,
    isConnected,
    unreadCount,
    markAsRead,
    markAllRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "reminder": return <Clock className="w-5 h-5 text-blue-500" />;
      case "rss": return <Rss className="w-5 h-5 text-orange-500" />;
      case "system": return <Settings className="w-5 h-5 text-primary" />;
      case "error": return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getTypeBadge = (type: Notification["type"]) => {
    const styles = {
      reminder: "bg-blue-500/20 text-blue-600 border-blue-500/30",
      rss: "bg-orange-500/20 text-orange-600 border-orange-500/30",
      system: "bg-primary/20 text-primary border-primary/30",
      error: "bg-red-500/20 text-red-600 border-red-500/30",
    };
    const labels = {
      reminder: "提醒",
      rss: "RSS",
      system: "系统",
      error: "错误",
    };
    return <Badge variant="outline" className={styles[type]}>{labels[type]}</Badge>;
  };

  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  const NotificationItem = ({ notification }: { notification: Notification }) => (
    <div
      className={`p-4 rounded-xl transition-colors group ${
        notification.read 
          ? "bg-muted/30 hover:bg-muted/50" 
          : "bg-accent/50 hover:bg-accent/70 border-l-4 border-primary"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          notification.read ? "bg-muted" : "bg-card"
        }`}>
          {getTypeIcon(notification.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-medium ${notification.read ? "text-muted-foreground" : "text-foreground"}`}>
              {notification.title}
            </h4>
            {getTypeBadge(notification.type)}
            {!notification.read && (
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
          <p className={`text-sm ${notification.read ? "text-muted-foreground" : "text-foreground"}`}>
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {new Date(notification.timestamp).toLocaleString("zh-CN")}
          </p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!notification.read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => markAsRead(notification.id)}
            >
              <Check className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => deleteNotification(notification.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🔔</span> 通知中心
          </h1>
          <p className="text-muted-foreground mt-1">查看提醒历史和系统通知</p>
        </div>
        <div className="flex items-center gap-3">
          {/* WebSocket 连接状态 */}
          <Badge 
            variant="outline" 
            className={`px-2 py-1 ${isConnected ? "text-green-600 border-green-500/30" : "text-muted-foreground"}`}
          >
            {isConnected ? (
              <><Wifi className="w-3 h-3 mr-1" /> 实时连接</>
            ) : (
              <><WifiOff className="w-3 h-3 mr-1" /> 离线</>
            )}
          </Badge>
          {unreadCount > 0 && (
            <Badge variant="default" className="px-3 py-1">
              <BellRing className="w-3 h-3 mr-1" />
              {unreadCount} 条未读
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
            <CheckCheck className="w-4 h-4" />
            全部已读
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={clearAll}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            清空
          </Button>
        </div>
      </div>

      <Tabs defaultValue="unread" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="unread" className="flex items-center gap-2">
            <BellRing className="w-4 h-4" />
            未读 ({unreadNotifications.length})
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            全部 ({notifications.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unread" className="mt-6">
          <Card>
            <CardContent className="p-4">
              {unreadNotifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>没有未读通知</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {unreadNotifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          <Card>
            <CardContent className="p-4">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>暂无通知</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {notifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NotificationsPage;