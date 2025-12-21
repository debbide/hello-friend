import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { messageApi } from "@/lib/api/backend";

interface SentMessage {
  id: string;
  content: string;
  timestamp: string;
  status: "sending" | "sent" | "delivered" | "failed";
}

const QuickSendPage = () => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("请输入消息内容");
      return;
    }

    const newMessage: SentMessage = {
      id: `s${Date.now()}`,
      content: message,
      timestamp: new Date().toISOString(),
      status: "sending",
    };

    setSentMessages([newMessage, ...sentMessages]);
    setMessage("");
    setIsSending(true);
    
    const result = await messageApi.sendToAdmin(message);
    
    if (result.success) {
      setSentMessages(prev => 
        prev.map(m => m.id === newMessage.id ? { ...m, status: "delivered" as const } : m)
      );
      toast.success("消息已发送");
    } else {
      setSentMessages(prev => 
        prev.map(m => m.id === newMessage.id ? { ...m, status: "failed" as const } : m)
      );
      toast.error(result.error || "发送失败");
    }
    
    setIsSending(false);
  };

  const getStatusBadge = (status: SentMessage["status"]) => {
    switch (status) {
      case "sending":
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />发送中</Badge>;
      case "sent":
        return <Badge variant="secondary">已发送</Badge>;
      case "delivered":
        return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">已送达</Badge>;
      case "failed":
        return <Badge variant="destructive">发送失败</Badge>;
    }
  };

  const quickMessages = [
    "🟢 Bot 运行正常",
    "📊 今日统计报告",
    "🔔 提醒测试",
    "✅ 任务完成通知",
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">📤</span> 快捷发送
          </h1>
          <p className="text-muted-foreground mt-1">直接发送消息到 Telegram</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send Message */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />
              发送消息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="输入要发送的消息..."
              rows={5}
              className="resize-none"
            />
            
            {/* Quick Messages */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">快捷消息：</p>
              <div className="flex flex-wrap gap-2">
                {quickMessages.map((qm, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage(qm)}
                  >
                    {qm}
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={handleSend} disabled={isSending} className="w-full gap-2">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              发送到 Telegram
            </Button>
          </CardContent>
        </Card>

        {/* Sent History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              发送历史
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sentMessages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Send className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无发送记录</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px]">
                <div className="space-y-3">
                  {sentMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-xl bg-accent/30 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-primary" />
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.timestamp).toLocaleString("zh-CN")}
                          </span>
                        </div>
                        {getStatusBadge(msg.status)}
                      </div>
                      <p className="text-sm text-foreground">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tips */}
      <Card className="bg-gradient-to-br from-accent/50 to-background">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">发送到管理员</h3>
              <p className="text-sm text-muted-foreground">
                消息将发送到设置中配置的管理员 ID。你可以用它来测试 Bot 连接、发送通知或调试。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QuickSendPage;
