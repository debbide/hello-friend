import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { nodeseekApi, NodeSeekLottery, NodeSeekBinding } from "@/lib/api/backend";
import {
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  Loader2,
  Ticket,
  Trophy,
  Users,
  Clock,
  Gift,
  Link,
} from "lucide-react";
import { toast } from "sonner";

const NodeSeekPage = () => {
  const [lotteries, setLotteries] = useState<NodeSeekLottery[]>([]);
  const [bindings, setBindings] = useState<NodeSeekBinding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedLottery, setSelectedLottery] = useState<NodeSeekLottery | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  const [newItem, setNewItem] = useState({
    url: "",
    title: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [lotteriesResult, bindingsResult] = await Promise.all([
      nodeseekApi.listLotteries(),
      nodeseekApi.getBindings(),
    ]);

    if (lotteriesResult.success && lotteriesResult.data) {
      setLotteries(lotteriesResult.data);
    }
    if (bindingsResult.success && bindingsResult.data) {
      setBindings(bindingsResult.data);
    }
    setIsLoading(false);
  };

  const handleAdd = async () => {
    if (!newItem.url) {
      toast.error("请填写抽奖链接");
      return;
    }

    const result = await nodeseekApi.createLottery(newItem.url, newItem.title || undefined);

    if (result.success) {
      await loadData();
      setNewItem({ url: "", title: "" });
      setIsAddDialogOpen(false);
      toast.success("添加成功");
    } else {
      toast.error(result.error || "添加失败");
    }
  };

  const handleDelete = async (postId: string) => {
    const result = await nodeseekApi.deleteLottery(postId);
    if (result.success) {
      setLotteries(lotteries.filter(l => l.postId !== postId));
      toast.success("删除成功");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const handleRefresh = async (postId: string) => {
    setRefreshingId(postId);
    const result = await nodeseekApi.refreshLottery(postId);
    if (result.success && result.data) {
      setLotteries(lotteries.map(l => l.postId === postId ? result.data! : l));
      toast.success("刷新成功");
    } else {
      toast.error(result.error || "刷新失败");
    }
    setRefreshingId(null);
  };

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true);
    const result = await nodeseekApi.refreshAll();
    if (result.success) {
      await loadData();
      toast.success("全部刷新完成");
    } else {
      toast.error(result.error || "刷新失败");
    }
    setIsRefreshingAll(false);
  };

  const handleShowDetail = async (lottery: NodeSeekLottery) => {
    setSelectedLottery(lottery);
    setIsDetailDialogOpen(true);
    setIsLoadingDetail(true);

    const result = await nodeseekApi.getLottery(lottery.postId);
    if (result.success && result.data) {
      setSelectedLottery(result.data);
    }
    setIsLoadingDetail(false);
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleString("zh-CN");
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56 mt-2" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-6 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">🎰</span> NodeSeek 抽奖监控
          </h1>
          <p className="text-muted-foreground mt-1">监控 NodeSeek 抽奖结果，中奖时自动通知</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRefreshAll}
            disabled={isRefreshingAll}
          >
            {isRefreshingAll ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            刷新全部
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                添加监控
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>添加抽奖监控</DialogTitle>
                <DialogDescription>
                  输入 NodeSeek 抽奖帖链接或 Lucky 链接
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>抽奖链接 *</Label>
                  <Input
                    placeholder="https://www.nodeseek.com/post-12345 或 lucky 链接"
                    value={newItem.url}
                    onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    支持帖子链接 (post-xxxxx) 或抽奖页面链接 (lucky?post=xxxxx)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>备注名称</Label>
                  <Input
                    placeholder="可选，用于区分不同抽奖"
                    value={newItem.title}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>取消</Button>
                <Button onClick={handleAdd}>添加</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Ticket className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{lotteries.length}</p>
                <p className="text-xs text-muted-foreground">监控抽奖</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bindings.length}</p>
                <p className="text-xs text-muted-foreground">绑定用户</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {lotteries.reduce((sum, l) => sum + l.winners.length, 0)}
                </p>
                <p className="text-xs text-muted-foreground">已通知中奖</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">5</p>
                <p className="text-xs text-muted-foreground">分钟/检查</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="lotteries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="lotteries">抽奖监控</TabsTrigger>
          <TabsTrigger value="bindings">用户绑定</TabsTrigger>
        </TabsList>

        <TabsContent value="lotteries">
          {lotteries.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center text-muted-foreground">
                <Ticket className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无监控的抽奖帖</p>
                <p className="text-sm mt-1">点击上方按钮添加第一个抽奖监控</p>
                <p className="text-sm mt-4 text-muted-foreground/70">
                  也可以在 Telegram 中使用 /watchns 命令添加
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lotteries.map(lottery => (
                <Card
                  key={lottery.id}
                  className="transition-all hover:shadow-md cursor-pointer"
                  onClick={() => handleShowDetail(lottery)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base line-clamp-1">{lottery.title}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          帖子 ID: {lottery.postId}
                        </p>
                      </div>
                      {lottery.winners.length > 0 && (
                        <Badge variant="default" className="bg-yellow-500 ml-2">
                          <Trophy className="w-3 h-3 mr-1" />
                          {lottery.winners.length}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Link */}
                      <a
                        href={`https://www.nodeseek.com/post-${lottery.postId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        查看帖子
                      </a>

                      {/* Last Check */}
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        上次检查: {formatTime(lottery.lastCheck)}
                      </p>

                      {/* Winners Preview */}
                      {lottery.winners.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {lottery.winners.slice(0, 3).map((w, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {w}
                            </Badge>
                          ))}
                          {lottery.winners.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{lottery.winners.length - 3}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefresh(lottery.postId);
                          }}
                          disabled={refreshingId === lottery.postId}
                        >
                          {refreshingId === lottery.postId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(lottery.postId);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bindings">
          {bindings.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无绑定用户</p>
                <p className="text-sm mt-1">用户可以在 Telegram 中使用 /bindns 命令绑定</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">已绑定的 NodeSeek 用户</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {bindings.map((binding, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-accent/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{binding.username}</p>
                          <p className="text-xs text-muted-foreground">
                            Telegram ID: {binding.telegramId}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">已绑定</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              {selectedLottery?.title}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {isLoadingDetail ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">加载中...</p>
              </div>
            ) : selectedLottery ? (
              <div className="space-y-4 pr-4">
                {/* Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Link className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">帖子 ID:</span>
                    <span>{selectedLottery.postId}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">上次检查:</span>
                    <span>{formatTime(selectedLottery.lastCheck)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">创建时间:</span>
                    <span>{formatTime(selectedLottery.createdAt)}</span>
                  </div>
                </div>

                {/* Current Winners */}
                {selectedLottery.currentWinners && selectedLottery.currentWinners.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      当前中奖者 ({selectedLottery.currentWinners.length})
                    </h4>
                    <div className="space-y-2">
                      {selectedLottery.currentWinners.map((winner, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-lg bg-accent/30"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              #{winner.position}
                            </Badge>
                            <span className="font-medium">{winner.username}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{winner.prize}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notified Winners */}
                {selectedLottery.winners.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-500" />
                      已通知中奖者 ({selectedLottery.winners.length})
                    </h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedLottery.winners.map((w, i) => (
                        <Badge key={i} variant="secondary">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error */}
                {selectedLottery.error && (
                  <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {selectedLottery.error}
                  </div>
                )}

                {/* Links */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <a
                      href={`https://www.nodeseek.com/post-${selectedLottery.postId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      查看帖子
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    asChild
                  >
                    <a
                      href={selectedLottery.luckyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Gift className="w-4 h-4 mr-2" />
                      查看抽奖
                    </a>
                  </Button>
                </div>
              </div>
            ) : null}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NodeSeekPage;
