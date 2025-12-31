import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trendingApi, TrendingData, TrendingItem } from "@/lib/api/backend";
import {
  RefreshCw,
  ExternalLink,
  Send,
  Loader2,
  TrendingUp,
  Clock,
  Flame,
} from "lucide-react";
import { toast } from "sonner";

// 源配置
const sourceConfig: Record<string, { emoji: string; color: string; bgColor: string }> = {
  weibo: { emoji: "🔥", color: "text-orange-500", bgColor: "bg-orange-500/10" },
  zhihu: { emoji: "💡", color: "text-blue-500", bgColor: "bg-blue-500/10" },
  github: { emoji: "🐙", color: "text-gray-700 dark:text-gray-300", bgColor: "bg-gray-500/10" },
  baidu: { emoji: "🔍", color: "text-blue-600", bgColor: "bg-blue-600/10" },
  bilibili: { emoji: "📺", color: "text-pink-500", bgColor: "bg-pink-500/10" },
  douyin: { emoji: "🎵", color: "text-gray-900 dark:text-gray-100", bgColor: "bg-gray-900/10" },
};

const TrendingPage = () => {
  const [trendingData, setTrendingData] = useState<Record<string, TrendingData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeSource, setActiveSource] = useState("weibo");
  const [isPushing, setIsPushing] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadTrending();
  }, []);

  const loadTrending = async () => {
    setIsLoading(true);
    const result = await trendingApi.getAll();
    if (result.success && result.data) {
      setTrendingData(result.data);
      // 设置第一个有数据的源为活跃标签
      const firstSource = Object.keys(result.data)[0];
      if (firstSource) {
        setActiveSource(firstSource);
      }
    } else {
      toast.error(result.error || "加载热榜失败");
    }
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const result = await trendingApi.getAll();
    if (result.success && result.data) {
      setTrendingData(result.data);
      toast.success("热榜已刷新");
    } else {
      toast.error(result.error || "刷新失败");
    }
    setIsRefreshing(false);
  };

  const handleRefreshSource = async (source: string) => {
    const result = await trendingApi.getBySource(source);
    if (result.success && result.data) {
      setTrendingData(prev => ({
        ...prev,
        [source]: result.data!,
      }));
      toast.success(`${result.data.name} 已刷新`);
    } else {
      toast.error(result.error || "刷新失败");
    }
  };

  const handlePush = async (source: string) => {
    setIsPushing(source);
    const result = await trendingApi.push(source, 10);
    if (result.success) {
      toast.success("已推送到 Telegram");
    } else {
      toast.error(result.error || "推送失败");
    }
    setIsPushing(null);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-red-500 hover:bg-red-600">🥇 1</Badge>;
    if (rank === 2) return <Badge className="bg-orange-500 hover:bg-orange-600">🥈 2</Badge>;
    if (rank === 3) return <Badge className="bg-yellow-500 hover:bg-yellow-600">🥉 3</Badge>;
    return <Badge variant="outline">{rank}</Badge>;
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56 mt-2" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                {[1, 2, 3, 4, 5].map(j => (
                  <div key={j} className="flex items-center gap-3 py-2">
                    <Skeleton className="w-8 h-6" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const sources = Object.keys(trendingData);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🔥</span> 热榜聚合
          </h1>
          <p className="text-muted-foreground mt-1">实时热门话题，一键推送到 Telegram</p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          {isRefreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          刷新全部
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Flame className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sources.length}</p>
                <p className="text-xs text-muted-foreground">热榜源</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {Object.values(trendingData).reduce((acc, d) => acc + (d.items?.length || 0), 0)}
                </p>
                <p className="text-xs text-muted-foreground">热门话题</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm font-medium">数据缓存 5 分钟</p>
                <p className="text-xs text-muted-foreground">
                  上次更新: {Object.values(trendingData)[0]?.updatedAt
                    ? formatTime(Object.values(trendingData)[0].updatedAt)
                    : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trending Tabs */}
      <Tabs value={activeSource} onValueChange={setActiveSource}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          {sources.map(source => {
            const data = trendingData[source];
            const config = sourceConfig[source] || { emoji: "📊", color: "text-gray-500", bgColor: "bg-gray-500/10" };
            return (
              <TabsTrigger key={source} value={source} className="gap-1.5">
                <span>{config.emoji}</span>
                <span>{data?.name || source}</span>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {data?.items?.length || 0}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {sources.map(source => {
          const data = trendingData[source];
          const config = sourceConfig[source] || { emoji: "📊", color: "text-gray-500", bgColor: "bg-gray-500/10" };

          return (
            <TabsContent key={source} value={source} className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                      {config.emoji}
                    </span>
                    {data?.name || source}
                    <Badge variant="outline" className="ml-2">
                      {data?.items?.length || 0} 条
                    </Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefreshSource(source)}
                      className="gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      刷新
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handlePush(source)}
                      disabled={isPushing === source}
                      className="gap-1"
                    >
                      {isPushing === source ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3" />
                      )}
                      推送
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!data?.items || data.items.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>暂无数据</p>
                      <p className="text-sm mt-1">点击刷新按钮获取最新热榜</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-1 pr-4">
                        {data.items.map((item: TrendingItem) => (
                          <a
                            key={`${source}-${item.rank}-${item.title}`}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors group"
                          >
                            <div className="w-8 flex-shrink-0">
                              {getRankBadge(item.rank)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                                {item.title}
                              </p>
                              {item.hot && (
                                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                  {item.hot}
                                </p>
                              )}
                            </div>
                            {item.tag && (
                              <Badge variant="outline" className="text-xs flex-shrink-0">
                                {item.tag}
                              </Badge>
                            )}
                            <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </a>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            快速推送
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {sources.map(source => {
              const data = trendingData[source];
              const config = sourceConfig[source] || { emoji: "📊", color: "text-gray-500", bgColor: "bg-gray-500/10" };
              return (
                <Button
                  key={source}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePush(source)}
                  disabled={isPushing === source}
                  className="gap-2"
                >
                  {isPushing === source ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>{config.emoji}</span>
                  )}
                  {data?.name || source}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            点击按钮将对应热榜 Top 10 推送到 Telegram
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrendingPage;
