import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { toolsApi, Tool } from "@/lib/api/backend";
import { toast } from "sonner";
import { 
  Globe, 
  Link, 
  QrCode, 
  CloudSun, 
  DollarSign, 
  MapPin, 
  Search,
  Settings,
  Loader2,
} from "lucide-react";

const iconMap: Record<string, React.ReactNode> = {
  tr: <Globe className="w-5 h-5" />,
  short: <Link className="w-5 h-5" />,
  qr: <QrCode className="w-5 h-5" />,
  weather: <CloudSun className="w-5 h-5" />,
  rate: <DollarSign className="w-5 h-5" />,
  ip: <MapPin className="w-5 h-5" />,
  whois: <Search className="w-5 h-5" />,
};

const ToolsPage = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setIsLoading(true);
    const result = await toolsApi.list();
    if (result.success && result.data) {
      setTools(result.data);
    } else {
      // 使用默认工具列表
      setTools([
        { id: "tr", command: "/tr", label: "翻译", description: "快速翻译文本到目标语言", emoji: "🌐", enabled: true, usage: 0 },
        { id: "short", command: "/short", label: "短链接", description: "生成短链接，方便分享", emoji: "🔗", enabled: true, usage: 0 },
        { id: "qr", command: "/qr", label: "二维码", description: "生成二维码图片", emoji: "📱", enabled: true, usage: 0 },
        { id: "weather", command: "/weather", label: "天气查询", description: "查询全球城市天气", emoji: "🌤️", enabled: true, usage: 0 },
        { id: "rate", command: "/rate", label: "汇率换算", description: "实时汇率换算", emoji: "💰", enabled: true, usage: 0 },
        { id: "ip", command: "/ip", label: "IP 查询", description: "查询 IP 归属地", emoji: "🌍", enabled: true, usage: 0 },
        { id: "whois", command: "/whois", label: "域名查询", description: "查询域名 WHOIS 信息", emoji: "🔍", enabled: true, usage: 0 },
      ]);
    }
    setIsLoading(false);
  };

  const handleToggle = async (id: string) => {
    const tool = tools.find(t => t.id === id);
    if (!tool) return;

    setTogglingId(id);
    const result = await toolsApi.toggle(id, !tool.enabled);
    
    if (result.success) {
      setTools(tools.map(t => 
        t.id === id ? { ...t, enabled: !t.enabled } : t
      ));
      toast.success(`${tool.label} 已${tool.enabled ? '禁用' : '启用'}`);
    } else {
      toast.error(result.error || "操作失败");
    }
    setTogglingId(null);
  };

  const enabledCount = tools.filter(t => t.enabled).length;
  const totalUsage = tools.reduce((acc, t) => acc + t.usage, 0);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🛠️</span> 实用工具
          </h1>
          <p className="text-muted-foreground mt-1">管理和配置 Bot 的实用工具功能</p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          {enabledCount}/{tools.length} 已启用 · 共 {totalUsage.toLocaleString()} 次调用
        </Badge>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <Card 
            key={tool.id} 
            className={`transition-all hover:shadow-soft ${!tool.enabled ? "opacity-60" : ""}`}
          >
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  tool.enabled ? "bg-primary/10" : "bg-muted"
                }`}>
                  <span className="text-2xl">{tool.emoji}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">{tool.label}</h3>
                    {togglingId === tool.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={tool.enabled}
                        onCheckedChange={() => handleToggle(tool.id)}
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <Badge variant="secondary" className="text-xs">
                      {tool.command}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      使用 {tool.usage} 次
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Tips */}
      <Card className="bg-gradient-to-br from-accent/50 to-background">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            使用提示
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p>🌐 <strong>/tr hello</strong> - 翻译文本</p>
              <p>🔗 <strong>/short https://...</strong> - 生成短链接</p>
              <p>📱 <strong>/qr https://...</strong> - 生成二维码</p>
            </div>
            <div className="space-y-2">
              <p>🌤️ <strong>/weather 北京</strong> - 查询天气</p>
              <p>💰 <strong>/rate 100 usd cny</strong> - 汇率换算</p>
              <p>🌍 <strong>/ip 1.1.1.1</strong> - IP 归属地</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ToolsPage;