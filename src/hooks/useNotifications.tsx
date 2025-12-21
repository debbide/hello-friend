import { useState, useEffect, useCallback } from "react";
import { notificationsApi, Notification } from "@/lib/api/backend";
import { useWebSocket, WebSocketMessage } from "./useWebSocket";
import { toast } from "sonner";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 处理 WebSocket 消息
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === 'notification') {
      const newNotification = message.data as Notification;
      
      // 添加新通知到列表顶部
      setNotifications(prev => [newNotification, ...prev]);
      
      // 显示 toast 通知
      toast(newNotification.title, {
        description: newNotification.message,
        icon: getNotificationIcon(newNotification.type),
      });
    }
  }, []);

  // 连接 WebSocket
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onConnect: () => {
      console.log('[Notifications] WebSocket connected');
    },
    onDisconnect: () => {
      console.log('[Notifications] WebSocket disconnected');
    },
  });

  // 加载通知列表
  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    const result = await notificationsApi.list();
    if (result.success && result.data) {
      setNotifications(result.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // 标记已读
  const markAsRead = useCallback(async (id: string) => {
    const result = await notificationsApi.markAsRead(id);
    if (result.success) {
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    }
    return result.success;
  }, []);

  // 全部已读
  const markAllRead = useCallback(async () => {
    const result = await notificationsApi.markAllRead();
    if (result.success) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success("已全部标为已读");
    } else {
      toast.error(result.error || "操作失败");
    }
    return result.success;
  }, []);

  // 删除通知
  const deleteNotification = useCallback(async (id: string) => {
    const result = await notificationsApi.delete(id);
    if (result.success) {
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success("通知已删除");
    } else {
      toast.error(result.error || "删除失败");
    }
    return result.success;
  }, []);

  // 清空通知
  const clearAll = useCallback(async () => {
    const result = await notificationsApi.clear();
    if (result.success) {
      setNotifications([]);
      toast.success("通知已清空");
    } else {
      toast.error(result.error || "清空失败");
    }
    return result.success;
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    isLoading,
    isConnected,
    unreadCount,
    loadNotifications,
    markAsRead,
    markAllRead,
    deleteNotification,
    clearAll,
  };
}

// 根据通知类型获取图标
function getNotificationIcon(type: Notification["type"]): string {
  switch (type) {
    case "reminder": return "⏰";
    case "rss": return "📰";
    case "system": return "⚙️";
    case "error": return "❌";
    default: return "🔔";
  }
}