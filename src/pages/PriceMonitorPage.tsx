import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { priceMonitorApi, PriceMonitorItem, PriceHistory } from "@/lib/api/backend";
import {
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Loader2,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Clock,
  Target,
  Settings,
  TestTube,
  History,
} from "lucide-react";
import { toast } from "sonner";

const PriceMonitorPage = () => {
  const [items, setItems] = useState<PriceMonitorItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PriceMonitorItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const [newItem, setNewItem] = useState({
    name: "",
    url: "",
    selector: "",
    interval: 60,
    targetPrice: "",
    notifyOnAnyChange: true,
    notifyOnDrop: false,
    dropThreshold: 10,
  });

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    setIsLoading(true);
    const result = await priceMonitorApi.list();
    if (result.success && result.data) {
      setItems(result.data);
    } else {
      toast.error(result.error || "加载失败");
    }
    setIsLoading(false);
  };

  const handleAdd = async () => {
    if (!newItem.url || !newItem.selector) {
      toast.error("请填写商品链接和价格选择器");
      return;
    }

    const result = await priceMonitorApi.create({
      name: newItem.name || "未命名商品",
      url: newItem.url,
      selector: newItem.selector,
      interval: newItem.interval,
      targetPrice: newItem.targetPrice ? parseFloat(newItem.targetPrice) : null,
      notifyOnAnyChange: newItem.notifyOnAnyChange,
      notifyOnDrop: newItem.notifyOnDrop,
      dropThreshold: newItem.dropThreshold,
    });

    if (result.success) {
      await loadItems();
      setNewItem({
        name: "",
        url: "",
        selector: "",
        interval: 60,
        targetPrice: "",
        notifyOnAnyChange: true,
        notifyOnDrop: false,
        dropThreshold: 10,
      });
      setIsAddDialogOpen(false);
      setTestResult(null);
      toast.success("添加成功");
    } else {
      toast.error(result.error || "添加失败");
    }
  };

  const handleUpdate = async () => {
    if (!selectedItem) return;

    const result = await priceMonitorApi.update(selectedItem.id, selectedItem);
    if (result.success) {
      await loadItems();
      setIsEditDialogOpen(false);
      toast.success("更新成功");
    } else {
      toast.error(result.error || "更新失败");
    }
  };

  const handleDelete = async (id: string) => {
    const result = await priceMonitorApi.delete(id);
    if (result.success) {
      setItems(items.filter(item => item.id !== id));
      toast.success("删除成功");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    const result = await priceMonitorApi.update(id, { enabled: !item.enabled });
    if (result.success) {
      setItems(items.map(i => i.id === id ? { ...i, enabled: !i.enabled } : i));
    } else {
      toast.error(result.error || "操作失败");
    }
  };

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    const result = await priceMonitorApi.refresh(id);
    if (result.success && result.data) {
      setItems(items.map(i => i.id === id ? result.data! : i));
      toast.success("刷新成功");
    } else {
      toast.error(result.error || "刷新失败");
    }
    setRefreshingId(null);
  };

  const handleTest = async () => {
    if (!newItem.url || !newItem.selector) {
      toast.error("请先填写商品链接和价格选择器");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    const result = await priceMonitorApi.test(newItem.url, newItem.selector);
    if (result.success && result.data) {
      setTestResult(result.data.price);
      toast.success(`提取成功: ¥${result.data.price}`);
    } else {
      toast.error(result.error || "提取失败，请检查选择器");
    }
    setIsTesting(false);
  };

  const handleShowHistory = async (item: PriceMonitorItem) => {
    setSelectedItem(item);
    setIsHistoryDialogOpen(true);
    setIsLoadingHistory(true);

    const result = await priceMonitorApi.getHistory(item.id);
    if (result.success && result.data) {
      setPriceHistory(result.data);
    }
    setIsLoadingHistory(false);
  };

  const openEditDialog = (item: PriceMonitorItem) => {
    setSelectedItem({ ...item });
    setIsEditDialogOpen(true);
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleString("zh-CN");
  };

  const getPriceChange = (item: PriceMonitorItem) => {
    if (item.currentPrice === null || item.lastPrice === null) return null;
    return item.currentPrice - item.lastPrice;
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-10 w-24 mb-2" />
                <Skeleton className="h-4 w-full" />
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
            <span className="text-2xl">💰</span> 价格监控
          </h1>
          <p className="text-muted-foreground mt-1">监控商品价格变化，降价时自动通知</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              添加监控
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>添加价格监控</DialogTitle>
              <DialogDescription>
                输入商品链接和价格元素的 CSS 选择器
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 py-4 pr-4">
                <div className="space-y-2">
                  <Label>商品名称</Label>
                  <Input
                    placeholder="iPhone 15 Pro"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>商品链接 *</Label>
                  <Input
                    placeholder="https://item.jd.com/123456.html"
                    value={newItem.url}
                    onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>价格选择器 *</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder=".price, #priceblock_ourprice"
                      value={newItem.selector}
                      onChange={(e) => setNewItem({ ...newItem, selector: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTest}
                      disabled={isTesting}
                    >
                      {isTesting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <TestTube className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    按 F12 打开开发者工具，选择价格元素，右键 Copy → Copy selector
                  </p>
                  {testResult !== null && (
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      提取成功: ¥{testResult}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>检查间隔 (分钟)</Label>
                    <Input
                      type="number"
                      value={newItem.interval}
                      onChange={(e) => setNewItem({ ...newItem, interval: parseInt(e.target.value) || 60 })}
                      min={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>目标价格</Label>
                    <Input
                      type="number"
                      placeholder="可选"
                      value={newItem.targetPrice}
                      onChange={(e) => setNewItem({ ...newItem, targetPrice: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">任何变化都通知</p>
                      <p className="text-xs text-muted-foreground">价格有任何变化时推送</p>
                    </div>
                    <Switch
                      checked={newItem.notifyOnAnyChange}
                      onCheckedChange={(checked) => setNewItem({ ...newItem, notifyOnAnyChange: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">仅降价通知</p>
                      <p className="text-xs text-muted-foreground">只在价格下降时推送</p>
                    </div>
                    <Switch
                      checked={newItem.notifyOnDrop}
                      onCheckedChange={(checked) => setNewItem({ ...newItem, notifyOnDrop: checked })}
                    />
                  </div>
                  {newItem.notifyOnDrop && (
                    <div className="space-y-2 pl-4">
                      <Label className="text-xs">降价阈值 (%)</Label>
                      <Input
                        type="number"
                        value={newItem.dropThreshold}
                        onChange={(e) => setNewItem({ ...newItem, dropThreshold: parseInt(e.target.value) || 0 })}
                        min={0}
                        max={100}
                      />
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>取消</Button>
              <Button onClick={handleAdd}>添加</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{items.length}</p>
                <p className="text-xs text-muted-foreground">监控商品</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{items.filter(i => i.enabled).length}</p>
                <p className="text-xs text-muted-foreground">监控中</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {items.filter(i => {
                    const change = getPriceChange(i);
                    return change !== null && change < 0;
                  }).length}
                </p>
                <p className="text-xs text-muted-foreground">近期降价</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{items.filter(i => i.lastError).length}</p>
                <p className="text-xs text-muted-foreground">异常</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Item List */}
      {items.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暂无监控商品</p>
            <p className="text-sm mt-1">点击上方按钮添加第一个价格监控</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const priceChange = getPriceChange(item);
            const isDropped = priceChange !== null && priceChange < 0;
            const isRisen = priceChange !== null && priceChange > 0;

            return (
              <Card
                key={item.id}
                className={`transition-all hover:shadow-md ${item.lastError ? "border-red-500/30" : ""}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base line-clamp-1">{item.name}</CardTitle>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="line-clamp-1">{new URL(item.url).hostname}</span>
                      </a>
                    </div>
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={() => handleToggle(item.id)}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {/* Price */}
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-bold">
                        {item.currentPrice !== null ? `¥${item.currentPrice}` : "-"}
                      </span>
                      {priceChange !== null && (
                        <Badge
                          variant={isDropped ? "default" : "destructive"}
                          className={`mb-1 ${isDropped ? "bg-green-500" : ""}`}
                        >
                          {isDropped ? <TrendingDown className="w-3 h-3 mr-1" /> : <TrendingUp className="w-3 h-3 mr-1" />}
                          {isDropped ? "" : "+"}¥{priceChange.toFixed(2)}
                        </Badge>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        每 {item.interval} 分钟
                      </span>
                      {item.targetPrice && (
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          目标 ¥{item.targetPrice}
                        </span>
                      )}
                    </div>

                    {/* Last Check */}
                    {item.lastCheck && (
                      <p className="text-xs text-muted-foreground">
                        上次检查: {formatTime(item.lastCheck)}
                      </p>
                    )}

                    {/* Error */}
                    {item.lastError && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {item.lastError}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRefresh(item.id)}
                        disabled={refreshingId === item.id}
                      >
                        {refreshingId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleShowHistory(item)}
                      >
                        <History className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(item)}
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑监控</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 py-4 pr-4">
                <div className="space-y-2">
                  <Label>商品名称</Label>
                  <Input
                    value={selectedItem.name}
                    onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>商品链接</Label>
                  <Input
                    value={selectedItem.url}
                    onChange={(e) => setSelectedItem({ ...selectedItem, url: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>价格选择器</Label>
                  <Input
                    value={selectedItem.selector}
                    onChange={(e) => setSelectedItem({ ...selectedItem, selector: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>检查间隔 (分钟)</Label>
                    <Input
                      type="number"
                      value={selectedItem.interval}
                      onChange={(e) => setSelectedItem({ ...selectedItem, interval: parseInt(e.target.value) || 60 })}
                      min={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>目标价格</Label>
                    <Input
                      type="number"
                      value={selectedItem.targetPrice || ""}
                      onChange={(e) => setSelectedItem({
                        ...selectedItem,
                        targetPrice: e.target.value ? parseFloat(e.target.value) : null
                      })}
                    />
                  </div>
                </div>
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">任何变化都通知</p>
                    <Switch
                      checked={selectedItem.notifyOnAnyChange}
                      onCheckedChange={(checked) => setSelectedItem({ ...selectedItem, notifyOnAnyChange: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">仅降价通知</p>
                    <Switch
                      checked={selectedItem.notifyOnDrop}
                      onCheckedChange={(checked) => setSelectedItem({ ...selectedItem, notifyOnDrop: checked })}
                    />
                  </div>
                  {selectedItem.notifyOnDrop && (
                    <div className="space-y-2 pl-4">
                      <Label className="text-xs">降价阈值 (%)</Label>
                      <Input
                        type="number"
                        value={selectedItem.dropThreshold}
                        onChange={(e) => setSelectedItem({ ...selectedItem, dropThreshold: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>取消</Button>
            <Button onClick={handleUpdate}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" />
              价格历史 - {selectedItem?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {isLoadingHistory ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">加载中...</p>
              </div>
            ) : priceHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="w-8 h-8 mx-auto mb-4 opacity-30" />
                <p>暂无价格记录</p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {priceHistory.slice().reverse().map((record, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/30"
                  >
                    <span className="font-medium">¥{record.price}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(record.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PriceMonitorPage;
