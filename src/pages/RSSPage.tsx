import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { subscriptionsApi, Subscription } from "@/lib/api/backend";
import { rssApi, FeedItem } from "@/lib/api/rss";
import {
  Rss,
  Plus,
  RefreshCw,
  Trash2,
  Clock,
  Filter,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Settings,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Eye,
  Bell,
  BellOff,
  Calendar,
  FileText,
  Pencil,
  Loader2,
  Link,
} from "lucide-react";
import { toast } from "sonner";

const RSSSkeleton = () => (
  <div className="space-y-6 animate-fade-in">
    <div className="flex items-center justify-between">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56 mt-2" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-6 h-6" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16 ml-auto" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2].map((j) => (
              <div key={j} className="flex items-center gap-4 p-4 rounded-xl bg-accent/30">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

// 分组数据
const defaultGroups = [
  { id: "tech", name: "科技", color: "blue" },
  { id: "news", name: "资讯", color: "green" },
  { id: "dev", name: "开发", color: "purple" },
];

interface FeedGroup {
  id: string;
  name: string;
  color: string;
}

interface ExtendedRSSFeed {
  id: string;
  title: string;
  url: string;
  interval: number;
  lastCheck: string;
  status: "active" | "error" | "paused";
  newItems: number;
  keywords: {
    whitelist: string[];
    blacklist: string[];
  };
  groupId?: string;
  pushEnabled?: boolean;
  pushTime?: { start: string; end: string };
  quietHours?: { enabled: boolean; start: string; end: string };
}

const RSSPage = () => {
  const [feeds, setFeeds] = useState<ExtendedRSSFeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [groups, setGroups] = useState<FeedGroup[]>(defaultGroups);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<ExtendedRSSFeed | null>(null);
  const [previewArticles, setPreviewArticles] = useState<FeedItem[]>([]);
  const [allArticles, setAllArticles] = useState<FeedItem[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [newFeed, setNewFeed] = useState({
    title: "",
    url: "",
    interval: 30,
    groupId: "tech",
    whitelist: "",
    blacklist: "",
    pushEnabled: true,
    quietStart: "22:00",
    quietEnd: "08:00",
    quietEnabled: false,
    customBotToken: "",  // 自定义 Bot Token
    customChatId: "",    // 自定义推送目标
  });
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["tech", "news", "dev"]);
  const [activeTab, setActiveTab] = useState("feeds");

  // 加载订阅数据
  useEffect(() => {
    loadFeeds();
  }, []);

  const loadFeeds = async () => {
    setIsLoading(true);
    const result = await subscriptionsApi.list();
    if (result.success && result.data) {
      const mappedFeeds: ExtendedRSSFeed[] = result.data.map(sub => ({
        id: sub.id,
        title: sub.title,
        url: sub.url,
        interval: sub.interval,
        lastCheck: sub.lastCheck || new Date().toISOString(),
        status: sub.enabled ? (sub.lastError ? "error" : "active") : "paused",
        newItems: 0,
        keywords: sub.keywords || { whitelist: [], blacklist: [] },
        groupId: "tech",
        pushEnabled: sub.enabled,
      }));
      setFeeds(mappedFeeds);
    }
    setIsLoading(false);
  };

  const handleAddFeed = async () => {
    if (!newFeed.title || !newFeed.url) {
      toast.error("请填写完整信息");
      return;
    }

    const result = await subscriptionsApi.create({
      title: newFeed.title,
      url: newFeed.url,
      interval: newFeed.interval,
      enabled: newFeed.pushEnabled,
      customBotToken: newFeed.customBotToken || undefined,
      customChatId: newFeed.customChatId || undefined,
      keywords: {
        whitelist: newFeed.whitelist.split(/[,，\n]/).map(s => s.trim()).filter(Boolean),
        blacklist: newFeed.blacklist.split(/[,，\n]/).map(s => s.trim()).filter(Boolean),
      },
    });

    if (result.success) {
      await loadFeeds();
      setNewFeed({
        title: "", url: "", interval: 30, groupId: "tech",
        whitelist: "", blacklist: "", pushEnabled: true,
        quietStart: "22:00", quietEnd: "08:00", quietEnabled: false,
        customBotToken: "", customChatId: "",
      });
      setIsAddDialogOpen(false);
      toast.success("订阅添加成功");
    } else {
      toast.error(result.error || "添加失败");
    }
  };

  const handleUpdateFeed = async () => {
    if (!selectedFeed) return;

    const result = await subscriptionsApi.update(selectedFeed.id, {
      title: selectedFeed.title,
      url: selectedFeed.url,
      interval: selectedFeed.interval,
      enabled: selectedFeed.pushEnabled,
      keywords: selectedFeed.keywords,
    });

    if (result.success) {
      await loadFeeds();
      setIsEditDialogOpen(false);
      toast.success("订阅已更新");
    } else {
      toast.error(result.error || "更新失败");
    }
  };

  const handleToggleFeed = async (id: string) => {
    const feed = feeds.find(f => f.id === id);
    if (!feed) return;

    const newEnabled = feed.status === "paused";
    const result = await subscriptionsApi.update(id, { enabled: newEnabled });

    if (result.success) {
      setFeeds(feeds.map(f =>
        f.id === id
          ? { ...f, status: newEnabled ? "active" : "paused" as "active" | "paused", pushEnabled: newEnabled }
          : f
      ));
    } else {
      toast.error(result.error || "操作失败");
    }
  };

  const handleDeleteFeed = async (id: string) => {
    const result = await subscriptionsApi.delete(id);
    if (result.success) {
      setFeeds(feeds.filter(feed => feed.id !== id));
      toast.success("订阅已删除");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const handleRefreshFeed = async (id: string) => {
    toast.info("正在刷新订阅...");

    const result = await subscriptionsApi.refresh(id);

    if (result.success) {
      await loadFeeds();
      toast.success("刷新成功");
    } else {
      toast.error(result.error || "刷新失败");
    }
  };

  const handleRefreshAll = async () => {
    toast.info("正在刷新全部订阅...");

    const result = await subscriptionsApi.refresh();

    if (result.success) {
      await loadFeeds();
      toast.success("全部订阅刷新完成");
    } else {
      toast.error(result.error || "刷新失败");
    }
  };

  const loadAllArticles = async () => {
    setIsLoadingArticles(true);
    const allItems: FeedItem[] = [];

    for (const feed of feeds.filter(f => f.status === "active")) {
      const result = await rssApi.parse(feed.url, feed.keywords);
      if (result.success && result.data) {
        allItems.push(...result.data.items.map(item => ({
          ...item,
          source: feed.title,
        } as FeedItem)));
      }
    }

    // Sort by date, newest first
    allItems.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    setAllArticles(allItems);
    setIsLoadingArticles(false);
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const openEditDialog = (feed: ExtendedRSSFeed) => {
    setSelectedFeed({ ...feed });
    setIsEditDialogOpen(true);
  };

  const openPreview = async (feed: ExtendedRSSFeed) => {
    setSelectedFeed(feed);
    setIsPreviewOpen(true);
    setIsLoadingPreview(true);
    setPreviewArticles([]);

    const result = await rssApi.parse(feed.url, feed.keywords);

    if (result.success && result.data) {
      setPreviewArticles(result.data.items);
    } else {
      toast.error(result.error || "加载内容失败");
    }

    setIsLoadingPreview(false);
  };

  const validateFeedUrl = async () => {
    if (!newFeed.url) return;

    setIsValidating(true);
    const result = await rssApi.validate(newFeed.url);

    if (result.valid) {
      toast.success(`验证成功: ${result.title}`);
      if (!newFeed.title && result.title) {
        setNewFeed({ ...newFeed, title: result.title });
      }
    } else {
      toast.error(result.error || "无效的 RSS 地址");
    }

    setIsValidating(false);
  };

  const getStatusBadge = (status: ExtendedRSSFeed["status"]) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30"><CheckCircle className="w-3 h-3 mr-1" />正常</Badge>;
      case "error":
        return <Badge variant="destructive" className="bg-red-500/20 text-red-600 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" />异常</Badge>;
      case "paused":
        return <Badge variant="secondary">已暂停</Badge>;
    }
  };

  const getGroupColor = (groupId?: string) => {
    const group = groups.find(g => g.id === groupId);
    switch (group?.color) {
      case "blue": return "bg-blue-500/20 text-blue-600";
      case "green": return "bg-green-500/20 text-green-600";
      case "purple": return "bg-purple-500/20 text-purple-600";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const feedsByGroup = groups.map(group => ({
    ...group,
    feeds: feeds.filter(f => f.groupId === group.id),
  }));

  const ungroupedFeeds = feeds.filter(f => !f.groupId || !groups.find(g => g.id === f.groupId));

  const totalNewItems = feeds.reduce((acc, feed) => acc + feed.newItems, 0);

  if (isLoading) {
    return <RSSSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">📰</span> RSS 订阅
          </h1>
          <p className="text-muted-foreground mt-1">管理你的 RSS 订阅源</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1">
            {feeds.length} 个订阅 · {totalNewItems} 条新内容
          </Badge>
          <Button variant="outline" onClick={handleRefreshAll} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            全部刷新
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                添加订阅
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>添加 RSS 订阅</DialogTitle>
                <DialogDescription>
                  配置新的 RSS 订阅源
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 py-4 pr-4">
                  {/* 基本信息 */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">标题 *</Label>
                      <Input
                        id="title"
                        value={newFeed.title}
                        onChange={(e) => setNewFeed({ ...newFeed, title: e.target.value })}
                        placeholder="少数派"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="url">RSS URL *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="url"
                          value={newFeed.url}
                          onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
                          placeholder="https://sspai.com/feed"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={validateFeedUrl}
                          disabled={!newFeed.url || isValidating}
                        >
                          {isValidating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        输入 URL 后点击验证按钮检测是否有效
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="interval">检查间隔 (分钟)</Label>
                        <Input
                          id="interval"
                          type="number"
                          value={newFeed.interval}
                          onChange={(e) => setNewFeed({ ...newFeed, interval: parseInt(e.target.value) || 30 })}
                          min={5}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="group">分组</Label>
                        <Select value={newFeed.groupId} onValueChange={(v) => setNewFeed({ ...newFeed, groupId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择分组" />
                          </SelectTrigger>
                          <SelectContent>
                            {groups.map(group => (
                              <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* 关键词过滤 */}
                  <div className="space-y-3 pt-4 border-t">
                    <Label className="flex items-center gap-2">
                      <Filter className="w-4 h-4" />
                      关键词过滤
                    </Label>
                    <div className="space-y-2">
                      <Label htmlFor="whitelist" className="text-xs text-muted-foreground">
                        白名单（包含这些词才推送，用逗号或换行分隔）
                      </Label>
                      <Textarea
                        id="whitelist"
                        value={newFeed.whitelist}
                        onChange={(e) => setNewFeed({ ...newFeed, whitelist: e.target.value })}
                        placeholder="效率, 工具, AI"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="blacklist" className="text-xs text-muted-foreground">
                        黑名单（包含这些词不推送）
                      </Label>
                      <Textarea
                        id="blacklist"
                        value={newFeed.blacklist}
                        onChange={(e) => setNewFeed({ ...newFeed, blacklist: e.target.value })}
                        placeholder="广告, 招聘"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* 推送设置 */}
                  <div className="space-y-3 pt-4 border-t">
                    <Label className="flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      推送设置
                    </Label>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">启用推送</p>
                        <p className="text-xs text-muted-foreground">有新内容时推送到 Telegram</p>
                      </div>
                      <Switch
                        checked={newFeed.pushEnabled}
                        onCheckedChange={(checked) => setNewFeed({ ...newFeed, pushEnabled: checked })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">免打扰时段</p>
                        <p className="text-xs text-muted-foreground">此时段内不推送消息</p>
                      </div>
                      <Switch
                        checked={newFeed.quietEnabled}
                        onCheckedChange={(checked) => setNewFeed({ ...newFeed, quietEnabled: checked })}
                      />
                    </div>
                    {newFeed.quietEnabled && (
                      <div className="grid grid-cols-2 gap-4 pl-4">
                        <div className="space-y-1">
                          <Label className="text-xs">开始时间</Label>
                          <Input
                            type="time"
                            value={newFeed.quietStart}
                            onChange={(e) => setNewFeed({ ...newFeed, quietStart: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">结束时间</Label>
                          <Input
                            type="time"
                            value={newFeed.quietEnd}
                            onChange={(e) => setNewFeed({ ...newFeed, quietEnd: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 高级推送设置 */}
                  <div className="space-y-3 pt-4 border-t">
                    <Label className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      高级推送设置（可选）
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      配置后使用自定义 Bot 推送，不配置则使用系统默认
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs">自定义 Bot Token</Label>
                      <Input
                        type="password"
                        placeholder="留空使用系统默认 Bot"
                        value={newFeed.customBotToken}
                        onChange={(e) => setNewFeed({ ...newFeed, customBotToken: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">自定义推送目标</Label>
                      <Input
                        placeholder="Chat ID / 群组 ID / @频道名"
                        value={newFeed.customChatId}
                        onChange={(e) => setNewFeed({ ...newFeed, customChatId: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        推送到指定用户、群组或频道
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleAddFeed}>添加订阅</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="feeds" className="gap-2">
            <Rss className="w-4 h-4" />
            订阅源
          </TabsTrigger>
          <TabsTrigger value="articles" className="gap-2">
            <FileText className="w-4 h-4" />
            最新文章
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2">
            <FolderOpen className="w-4 h-4" />
            分组管理
          </TabsTrigger>
        </TabsList>

        {/* 订阅源列表 */}
        <TabsContent value="feeds" className="mt-6 space-y-4">
          {feedsByGroup.map(group => (
            <Collapsible
              key={group.id}
              open={expandedGroups.includes(group.id)}
              onOpenChange={() => toggleGroup(group.id)}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                  {expandedGroups.includes(group.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className={`w-3 h-3 rounded-full ${group.color === "blue" ? "bg-blue-500" :
                      group.color === "green" ? "bg-green-500" : "bg-purple-500"
                    }`} />
                  <span className="font-medium">{group.name}</span>
                  <Badge variant="secondary" className="ml-2">{group.feeds.length}</Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-3">
                {group.feeds.map((feed) => (
                  <FeedCard
                    key={feed.id}
                    feed={feed}
                    onToggle={handleToggleFeed}
                    onRefresh={handleRefreshFeed}
                    onDelete={handleDeleteFeed}
                    onEdit={openEditDialog}
                    onPreview={openPreview}
                    getStatusBadge={getStatusBadge}
                  />
                ))}
                {group.feeds.length === 0 && (
                  <p className="text-center text-muted-foreground py-4 text-sm">该分组暂无订阅</p>
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}

          {ungroupedFeeds.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <FolderOpen className="w-4 h-4" />
                <span className="font-medium">未分组</span>
                <Badge variant="secondary" className="ml-2">{ungroupedFeeds.length}</Badge>
              </div>
              {ungroupedFeeds.map((feed) => (
                <FeedCard
                  key={feed.id}
                  feed={feed}
                  onToggle={handleToggleFeed}
                  onRefresh={handleRefreshFeed}
                  onDelete={handleDeleteFeed}
                  onEdit={openEditDialog}
                  onPreview={openPreview}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}

          {feeds.length === 0 && (
            <Card className="py-12">
              <CardContent className="text-center text-muted-foreground">
                <Rss className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无订阅</p>
                <p className="text-sm mt-1">点击上方按钮添加第一个 RSS 订阅</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 最新文章 */}
        <TabsContent value="articles" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                最新文章
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAllArticles}
                disabled={isLoadingArticles}
                className="gap-2"
              >
                {isLoadingArticles ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                加载最新
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingArticles ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                  <p>正在加载文章...</p>
                </div>
              ) : allArticles.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>暂无文章</p>
                  <p className="text-sm mt-1">点击"加载最新"获取订阅内容</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3 pr-4">
                    {allArticles.map((article) => (
                      <a
                        key={article.id}
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 rounded-lg border transition-colors cursor-pointer hover:bg-accent/50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium line-clamp-2">{article.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{article.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span>{(article as any).source || "未知来源"}</span>
                              <span>{new Date(article.pubDate).toLocaleString("zh-CN")}</span>
                              {article.categories && article.categories.length > 0 && (
                                <div className="flex gap-1">
                                  {article.categories.slice(0, 2).map((cat, i) => (
                                    <Badge key={i} variant="outline" className="text-xs py-0">{cat}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                        </div>
                      </a>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 分组管理 */}
        <TabsContent value="groups" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                分组管理
              </CardTitle>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                新建分组
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {groups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <span className={`w-4 h-4 rounded-full ${group.color === "blue" ? "bg-blue-500" :
                          group.color === "green" ? "bg-green-500" : "bg-purple-500"
                        }`} />
                      <span className="font-medium">{group.name}</span>
                      <Badge variant="secondary">
                        {feeds.filter(f => f.groupId === group.id).length} 个订阅
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 编辑订阅 Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑订阅</DialogTitle>
            <DialogDescription>
              修改 RSS 订阅配置
            </DialogDescription>
          </DialogHeader>
          {selectedFeed && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 py-4 pr-4">
                <div className="space-y-2">
                  <Label>标题</Label>
                  <Input
                    value={selectedFeed.title}
                    onChange={(e) => setSelectedFeed({ ...selectedFeed, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>RSS URL</Label>
                  <Input
                    value={selectedFeed.url}
                    onChange={(e) => setSelectedFeed({ ...selectedFeed, url: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>检查间隔 (分钟)</Label>
                    <Input
                      type="number"
                      value={selectedFeed.interval}
                      onChange={(e) => setSelectedFeed({ ...selectedFeed, interval: parseInt(e.target.value) || 30 })}
                      min={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>分组</Label>
                    <Select
                      value={selectedFeed.groupId || ""}
                      onValueChange={(v) => setSelectedFeed({ ...selectedFeed, groupId: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择分组" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map(group => (
                          <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* 关键词过滤 */}
                <div className="space-y-3 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    关键词过滤
                  </Label>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">白名单</Label>
                    <Textarea
                      value={selectedFeed.keywords.whitelist.join(", ")}
                      onChange={(e) => setSelectedFeed({
                        ...selectedFeed,
                        keywords: {
                          ...selectedFeed.keywords,
                          whitelist: e.target.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      placeholder="效率, 工具, AI"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">黑名单</Label>
                    <Textarea
                      value={selectedFeed.keywords.blacklist.join(", ")}
                      onChange={(e) => setSelectedFeed({
                        ...selectedFeed,
                        keywords: {
                          ...selectedFeed.keywords,
                          blacklist: e.target.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
                        }
                      })}
                      placeholder="广告, 招聘"
                      rows={2}
                    />
                  </div>
                </div>

                {/* 推送设置 */}
                <div className="space-y-3 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    推送设置
                  </Label>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">启用推送</p>
                    </div>
                    <Switch
                      checked={selectedFeed.pushEnabled ?? true}
                      onCheckedChange={(checked) => setSelectedFeed({ ...selectedFeed, pushEnabled: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">免打扰时段</p>
                    </div>
                    <Switch
                      checked={selectedFeed.quietHours?.enabled ?? false}
                      onCheckedChange={(checked) => setSelectedFeed({
                        ...selectedFeed,
                        quietHours: {
                          enabled: checked,
                          start: selectedFeed.quietHours?.start || "22:00",
                          end: selectedFeed.quietHours?.end || "08:00"
                        }
                      })}
                    />
                  </div>
                  {selectedFeed.quietHours?.enabled && (
                    <div className="grid grid-cols-2 gap-4 pl-4">
                      <div className="space-y-1">
                        <Label className="text-xs">开始时间</Label>
                        <Input
                          type="time"
                          value={selectedFeed.quietHours.start}
                          onChange={(e) => setSelectedFeed({
                            ...selectedFeed,
                            quietHours: { ...selectedFeed.quietHours!, start: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">结束时间</Label>
                        <Input
                          type="time"
                          value={selectedFeed.quietHours.end}
                          onChange={(e) => setSelectedFeed({
                            ...selectedFeed,
                            quietHours: { ...selectedFeed.quietHours!, end: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateFeed}>保存修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 内容预览 Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rss className="w-4 h-4" />
              {selectedFeed?.title}
            </DialogTitle>
            <DialogDescription>
              最新内容预览
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-4">
              {isLoadingPreview ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                  <p>正在加载内容...</p>
                </div>
              ) : previewArticles.length > 0 ? (
                previewArticles.map((article) => (
                  <a
                    key={article.id}
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 rounded-lg border hover:bg-accent/50 cursor-pointer"
                  >
                    <h4 className="font-medium">{article.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{article.description}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(article.pubDate).toLocaleString("zh-CN")}
                    </p>
                  </a>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>暂无内容</p>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>关闭</Button>
            {selectedFeed && (
              <Button className="gap-2" asChild>
                <a href={selectedFeed.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  打开源站
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
};

// Feed Card 组件
interface FeedCardProps {
  feed: ExtendedRSSFeed;
  onToggle: (id: string) => void;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (feed: ExtendedRSSFeed) => void;
  onPreview: (feed: ExtendedRSSFeed) => void;
  getStatusBadge: (status: ExtendedRSSFeed["status"]) => JSX.Element;
}

const FeedCard = ({ feed, onToggle, onRefresh, onDelete, onEdit, onPreview, getStatusBadge }: FeedCardProps) => {
  return (
    <Card className={`transition-all hover:shadow-soft ${feed.status === "error" ? "border-red-500/30" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${feed.status === "error"
            ? "bg-red-500/10"
            : feed.status === "paused"
              ? "bg-muted"
              : "bg-primary/10"
            }`}>
            <Rss className={`w-6 h-6 ${feed.status === "error"
              ? "text-red-500"
              : feed.status === "paused"
                ? "text-muted-foreground"
                : "text-primary"
              }`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-semibold text-foreground">{feed.title}</h3>
              {getStatusBadge(feed.status)}
              {feed.newItems > 0 && (
                <Badge variant="default" className="bg-primary/20 text-primary border-0">
                  +{feed.newItems} 新
                </Badge>
              )}
              {feed.pushEnabled === false && (
                <Badge variant="outline" className="text-muted-foreground">
                  <BellOff className="w-3 h-3 mr-1" />
                  静音
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate mb-2">{feed.url}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                每 {feed.interval} 分钟
              </span>
              <span>
                上次检查: {new Date(feed.lastCheck).toLocaleString("zh-CN")}
              </span>
              {(feed.keywords.whitelist.length > 0 || feed.keywords.blacklist.length > 0) && (
                <span className="flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  已设置过滤
                </span>
              )}
              {feed.quietHours?.enabled && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {feed.quietHours.start}-{feed.quietHours.end} 免打扰
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Switch
              checked={feed.status !== "paused"}
              onCheckedChange={() => onToggle(feed.id)}
            />
            <Button variant="ghost" size="icon" onClick={() => onPreview(feed)}>
              <Eye className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onEdit(feed)}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onRefresh(feed.id)}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <a href={feed.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(feed.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Keywords */}
        {(feed.keywords.whitelist.length > 0 || feed.keywords.blacklist.length > 0) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
            {feed.keywords.whitelist.map((kw, i) => (
              <Badge key={`w-${i}`} variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                + {kw}
              </Badge>
            ))}
            {feed.keywords.blacklist.map((kw, i) => (
              <Badge key={`b-${i}`} variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                - {kw}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RSSPage;