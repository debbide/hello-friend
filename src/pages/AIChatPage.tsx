import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { settingsApi } from "@/lib/api/backend";
import { 
  Bot, 
  Settings, 
  MessageSquare, 
  Trash2, 
  Save, 
  Eye, 
  EyeOff, 
  Sparkles, 
  Search,
  TrendingUp,
  DollarSign,
  Zap,
  BarChart3,
  Globe,
  Server,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface AIConfig {
  providerType: "official" | "thirdparty";
  apiKey: string;
  apiUrl: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  streamEnabled: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokens?: number;
}

const defaultAPIUsage = [
  { date: "12-15", tokens: 0, cost: 0, requests: 0 },
  { date: "12-16", tokens: 0, cost: 0, requests: 0 },
  { date: "12-17", tokens: 0, cost: 0, requests: 0 },
  { date: "12-18", tokens: 0, cost: 0, requests: 0 },
  { date: "12-19", tokens: 0, cost: 0, requests: 0 },
  { date: "12-20", tokens: 0, cost: 0, requests: 0 },
  { date: "12-21", tokens: 0, cost: 0, requests: 0 },
];

const AIChatPage = () => {
  const [config, setConfig] = useState<AIConfig>({
    providerType: "official",
    apiKey: "",
    apiUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    systemPrompt: "你是一个友好、专业的 AI 助手，善于用简洁明了的方式回答问题。",
    maxTokens: 2048,
    temperature: 0.7,
    streamEnabled: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [apiUsage] = useState(defaultAPIUsage);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    const result = await settingsApi.get();
    if (result.success && result.data?.ai) {
      setConfig(prev => ({
        ...prev,
        providerType: result.data!.ai?.providerType || "official",
        apiKey: result.data!.ai?.apiKey || "",
        apiUrl: result.data!.ai?.apiUrl || "https://api.openai.com/v1",
        model: result.data!.ai?.model || "gpt-4o-mini",
        systemPrompt: result.data!.ai?.systemPrompt || prev.systemPrompt,
        maxTokens: result.data!.ai?.maxTokens || 2048,
        temperature: result.data!.ai?.temperature || 0.7,
        streamEnabled: result.data!.ai?.streamEnabled ?? true,
      }));
    }
    setIsLoading(false);
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    const result = await settingsApi.update({
      ai: {
        providerType: config.providerType,
        apiKey: config.apiKey,
        apiUrl: config.apiUrl,
        model: config.model,
        systemPrompt: config.systemPrompt,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        streamEnabled: config.streamEnabled,
      },
    });
    if (result.success) {
      toast.success("配置已保存");
    } else {
      toast.error(result.error || "保存失败");
    }
    setIsSaving(false);
  };

  const handleClearHistory = () => {
    setChatHistory([]);
    toast.success("对话历史已清空");
  };

  const totalTokens = chatHistory.reduce((acc, msg) => acc + (msg.tokens || 0), 0);
  const totalCost = apiUsage.reduce((acc, day) => acc + day.cost, 0);
  const totalRequests = apiUsage.reduce((acc, day) => acc + day.requests, 0);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return chatHistory;
    return chatHistory.filter(msg => 
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [chatHistory, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🤖</span> AI 对话
          </h1>
          <p className="text-muted-foreground mt-1">OpenAI 配置、用量追踪与对话历史</p>
        </div>
        <Badge variant="secondary" className="px-3 py-1">
          <Sparkles className="w-3 h-3 mr-1" />
          已用 {(totalTokens / 1000).toFixed(1)}k Tokens
        </Badge>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            配置
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            用量
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            历史
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">🔌 API 提供商</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setConfig({ ...config, providerType: "official", apiUrl: "https://api.openai.com/v1" })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${config.providerType === "official" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.providerType === "official" ? "bg-primary/20" : "bg-muted"}`}>
                        <Globe className={`w-5 h-5 ${config.providerType === "official" ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">OpenAI 官方</span>
                          {config.providerType === "official" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                        </div>
                        <p className="text-sm text-muted-foreground">使用 OpenAI 官方 API</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, providerType: "thirdparty", apiUrl: config.apiUrl === "https://api.openai.com/v1" ? "" : config.apiUrl })}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${config.providerType === "thirdparty" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.providerType === "thirdparty" ? "bg-primary/20" : "bg-muted"}`}>
                        <Server className={`w-5 h-5 ${config.providerType === "thirdparty" ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">第三方中转</span>
                          {config.providerType === "thirdparty" && <CheckCircle2 className="w-4 h-4 text-primary" />}
                        </div>
                        <p className="text-sm text-muted-foreground">兼容 OpenAI 格式的 API</p>
                      </div>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">🔑 API 设置</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <div className="flex gap-2">
                    <Input id="apiKey" type={showApiKey ? "text" : "password"} value={config.apiKey} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} placeholder="sk-..." className="flex-1" />
                    <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiUrl">API URL</Label>
                  <Input id="apiUrl" value={config.apiUrl} onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })} placeholder="https://api.openai.com/v1" disabled={config.providerType === "official"} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">模型</Label>
                  {config.providerType === "official" ? (
                    <Select value={config.model} onValueChange={(value) => setConfig({ ...config, model: value })}>
                      <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                        <SelectItem value="gpt-4o-mini">GPT-4o-mini</SelectItem>
                        <SelectItem value="gpt-4-turbo">GPT-4-turbo</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5-turbo</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id="model" value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} placeholder="gpt-4o-mini / claude-3-sonnet" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">⚙️ 模型参数</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><Label>Max Tokens</Label><span className="text-sm font-medium text-primary">{config.maxTokens}</span></div>
                  <Slider value={[config.maxTokens]} onValueChange={([value]) => setConfig({ ...config, maxTokens: value })} min={256} max={4096} step={256} />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><Label>Temperature</Label><span className="text-sm font-medium text-primary">{config.temperature}</span></div>
                  <Slider value={[config.temperature * 100]} onValueChange={([value]) => setConfig({ ...config, temperature: value / 100 })} min={0} max={200} step={10} />
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div><Label>流式输出</Label><p className="text-xs text-muted-foreground">实时显示 AI 回复</p></div>
                  <Switch checked={config.streamEnabled ?? true} onCheckedChange={(checked) => setConfig({ ...config, streamEnabled: checked })} />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base flex items-center gap-2">🎭 System Prompt</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Textarea value={config.systemPrompt} onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })} placeholder="你是一个友好的 AI 助手..." rows={4} className="resize-none" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={config.providerType === "official" ? "default" : "secondary"}>{config.providerType === "official" ? "OpenAI 官方" : "第三方中转"}</Badge>
                    <Badge variant="outline">{config.model}</Badge>
                  </div>
                  <Button onClick={handleSaveConfig} disabled={isSaving} className="gap-2">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    保存配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="usage" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 to-background">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center"><Zap className="w-6 h-6 text-primary" /></div>
                  <div><p className="text-sm text-muted-foreground">总 Tokens</p><p className="text-2xl font-bold text-foreground">{(apiUsage.reduce((acc, d) => acc + d.tokens, 0) / 1000).toFixed(1)}k</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-background">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center"><DollarSign className="w-6 h-6 text-green-500" /></div>
                  <div><p className="text-sm text-muted-foreground">预估费用</p><p className="text-2xl font-bold text-foreground">${totalCost.toFixed(2)}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-background">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center"><TrendingUp className="w-6 h-6 text-blue-500" /></div>
                  <div><p className="text-sm text-muted-foreground">总请求数</p><p className="text-2xl font-bold text-foreground">{totalRequests}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">📈 Token 使用趋势</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={apiUsage}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="tokens" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.3)" name="Tokens" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2">💰 费用趋势</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apiUsage}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
                      <Bar dataKey="cost" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} name="费用" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base flex items-center gap-2">💬 对话历史</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索对话..." className="pl-9 w-[200px]" />
                </div>
                <Button variant="outline" size="sm" onClick={handleClearHistory} className="gap-2 text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />清空
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>{searchQuery ? "未找到匹配的对话" : "暂无对话历史"}</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-4">
                    {filteredHistory.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-accent text-accent-foreground rounded-bl-md"}`}>
                          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-current/10">
                            <span className="text-xs opacity-70">{new Date(msg.timestamp).toLocaleString("zh-CN")}</span>
                            {msg.tokens && <span className="text-xs opacity-70">{msg.tokens} tokens</span>}
                          </div>
                        </div>
                      </div>
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

export default AIChatPage;