import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { aiProvidersApi, AIProvider } from "@/lib/api/backend";
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
  Plus,
  CheckCircle2,
  Loader2,
  Pencil,
  Power,
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
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [apiUsage] = useState(defaultAPIUsage);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [newProvider, setNewProvider] = useState({
    name: "",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setIsLoading(true);
    const result = await aiProvidersApi.list();
    if (result.success && result.data) {
      setProviders(result.data);
    }
    setIsLoading(false);
  };

  const handleSaveProvider = async () => {
    setIsSaving(true);

    if (editingProvider) {
      // 更新现有配置
      const result = await aiProvidersApi.update(editingProvider.id, newProvider);
      if (result.success) {
        toast.success("配置已更新");
        loadProviders();
      } else {
        toast.error(result.error || "更新失败");
      }
    } else {
      // 创建新配置
      const result = await aiProvidersApi.create(newProvider);
      if (result.success) {
        toast.success("配置已添加");
        loadProviders();
      } else {
        toast.error(result.error || "添加失败");
      }
    }

    setIsSaving(false);
    setDialogOpen(false);
    setEditingProvider(null);
    setNewProvider({
      name: "",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
  };

  const handleDeleteProvider = async (id: string) => {
    const result = await aiProvidersApi.delete(id);
    if (result.success) {
      toast.success("配置已删除");
      loadProviders();
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const handleActivateProvider = async (id: string) => {
    const result = await aiProvidersApi.activate(id);
    if (result.success) {
      toast.success(result.message || "已切换");
      loadProviders();
    } else {
      toast.error(result.error || "切换失败");
    }
  };

  const openEditDialog = (provider: AIProvider) => {
    setEditingProvider(provider);
    setNewProvider({
      name: provider.name,
      apiKey: "", // 不回显 API Key
      baseUrl: provider.baseUrl,
      model: provider.model,
    });
    setDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingProvider(null);
    setNewProvider({
      name: "",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    });
    setDialogOpen(true);
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

  const activeProvider = providers.find(p => p.isActive);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🤖</span> AI 对话
          </h1>
          <p className="text-muted-foreground mt-1">
            管理多个 AI API 配置，一键切换使用
          </p>
        </div>
        {activeProvider && (
          <Badge variant="secondary" className="px-3 py-1">
            <Sparkles className="w-3 h-3 mr-1" />
            当前: {activeProvider.name}
          </Badge>
        )}
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
          <div className="space-y-4">
            {/* 添加配置按钮 */}
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">API 配置列表</h2>
              <Button onClick={openAddDialog} className="gap-2">
                <Plus className="w-4 h-4" />
                添加配置
              </Button>
            </div>

            {/* 配置列表 */}
            {providers.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bot className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">暂无 AI 配置</p>
                  <Button onClick={openAddDialog} variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    添加第一个配置
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map((provider) => (
                  <Card
                    key={provider.id}
                    className={`relative transition-all ${provider.isActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-primary/50"
                      }`}
                  >
                    {provider.isActive && (
                      <div className="absolute -top-2 -right-2">
                        <Badge className="bg-primary text-primary-foreground">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          使用中
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bot className="w-4 h-4" />
                        {provider.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-sm text-muted-foreground">
                        <p className="truncate">🔗 {provider.baseUrl}</p>
                        <p>🧠 {provider.model}</p>
                        <p>🔑 {provider.apiKey}</p>
                      </div>
                      <div className="flex gap-2 pt-2">
                        {!provider.isActive && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleActivateProvider(provider.id)}
                            className="flex-1 gap-1"
                          >
                            <Power className="w-3 h-3" />
                            激活
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(provider)}
                          className="gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteProvider(provider.id)}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
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

      {/* 添加/编辑配置对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProvider ? "编辑配置" : "添加 AI 配置"}</DialogTitle>
            <DialogDescription>
              配置 OpenAI 兼容的 API 服务
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">配置名称</Label>
              <Input
                id="name"
                value={newProvider.name}
                onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                placeholder="如：OpenAI 官方、便宜中转"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={newProvider.apiKey}
                  onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                  placeholder={editingProvider ? "留空则保持不变" : "sk-..."}
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseUrl">API 地址</Label>
              <Input
                id="baseUrl"
                value={newProvider.baseUrl}
                onChange={(e) => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">默认模型</Label>
              <Input
                id="model"
                value={newProvider.model}
                onChange={(e) => setNewProvider({ ...newProvider, model: e.target.value })}
                placeholder="gpt-4o-mini"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSaveProvider}
              disabled={isSaving || !newProvider.name || (!editingProvider && !newProvider.apiKey) || !newProvider.baseUrl}
              className="gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIChatPage;