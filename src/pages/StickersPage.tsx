import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { stickersApi, Sticker, StickerGroup, stickerPacksApi, StickerPack, BACKEND_URL } from "@/lib/api/backend";
import { Sticker as StickerIcon, FolderOpen, Trash2, Tag, RefreshCw, Search, Grid3X3, List, Download, Upload, Loader2, ExternalLink, Package, ImageDown } from "lucide-react";
import { toast } from "sonner";

const StickersSkeleton = () => (
  <div className="space-y-6 animate-fade-in">
    <div className="flex items-center justify-between">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-52 mt-2" />
      </div>
      <Skeleton className="h-8 w-32" />
    </div>
    <Skeleton className="h-10 w-full max-w-md" />
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
      {[...Array(20)].map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-xl" />
      ))}
    </div>
  </div>
);

const StickersPage = () => {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [groups, setGroups] = useState<StickerGroup[]>([]);
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"stickers" | "packs">("stickers");

  // Dialog states
  const [selectedSticker, setSelectedSticker] = useState<Sticker | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditTagsOpen, setIsEditTagsOpen] = useState(false);
  const [editTags, setEditTags] = useState("");
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Import/Export states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importTitle, setImportTitle] = useState("");
  const [importEmoji, setImportEmoji] = useState("😀");
  const [importMode, setImportMode] = useState<"new" | "existing">("new");
  const [importPackName, setImportPackName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    mode?: "new" | "existing";
    packName?: string;
    packTitle?: string;
    link?: string;
    stickerCount?: number;
    errors?: string[];
  } | null>(null);

  // Pack preview states
  const [isPackPreviewOpen, setIsPackPreviewOpen] = useState(false);
  const [previewPack, setPreviewPack] = useState<StickerPack | null>(null);
  const [previewStickers, setPreviewStickers] = useState<Array<{
    fileId: string;
    emoji: string;
    isAnimated: boolean;
    isVideo: boolean;
    fileUrl?: string;
  }>>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExportingPack, setIsExportingPack] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [stickersResult, groupsResult, packsResult] = await Promise.all([
      stickersApi.list(),
      stickersApi.getGroups(),
      stickerPacksApi.list(),
    ]);
    if (stickersResult.success && stickersResult.data) {
      setStickers(stickersResult.data);
    }
    if (groupsResult.success && groupsResult.data) {
      setGroups(groupsResult.data);
    }
    if (packsResult.success && packsResult.data) {
      setStickerPacks(packsResult.data);
    }
    setIsLoading(false);
  };

  const handleDelete = async () => {
    if (!selectedSticker) return;
    const result = await stickersApi.delete(selectedSticker.id);
    if (result.success) {
      setStickers(stickers.filter(s => s.id !== selectedSticker.id));
      setIsDeleteOpen(false);
      setIsDetailOpen(false);
      setSelectedSticker(null);
      toast.success("贴纸已删除");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const handleUpdateTags = async () => {
    if (!selectedSticker) return;
    const tags = editTags.split(/[\s,，]+/).filter(t => t.trim());
    const result = await stickersApi.update(selectedSticker.id, { tags });
    if (result.success && result.data) {
      setStickers(stickers.map(s => s.id === selectedSticker.id ? result.data! : s));
      setSelectedSticker(result.data);
      setIsEditTagsOpen(false);
      toast.success("标签已更新");
    } else {
      toast.error(result.error || "更新失败");
    }
  };

  const handleMoveToGroup = async (groupId: string | null) => {
    if (!selectedSticker) return;
    const result = await stickersApi.update(selectedSticker.id, { groupId });
    if (result.success && result.data) {
      setStickers(stickers.map(s => s.id === selectedSticker.id ? result.data! : s));
      setSelectedSticker(result.data);
      toast.success(groupId ? "已移动到分组" : "已移出分组");
    } else {
      toast.error(result.error || "移动失败");
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("请输入分组名称");
      return;
    }
    const result = await stickersApi.createGroup(newGroupName);
    if (result.success && result.data) {
      setGroups([...groups, result.data]);
      setNewGroupName("");
      setIsAddGroupOpen(false);
      toast.success("分组已创建");
    } else {
      toast.error(result.error || "创建失败");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const result = await stickersApi.deleteGroup(groupId);
    if (result.success) {
      setGroups(groups.filter(g => g.id !== groupId));
      if (selectedGroup === groupId) {
        setSelectedGroup(null);
      }
      // 刷新贴纸列表以更新分组信息
      loadData();
      toast.success("分组已删除");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  // 预览贴纸包
  const handlePreviewPack = async (pack: StickerPack) => {
    setPreviewPack(pack);
    setPreviewStickers([]);
    setIsPackPreviewOpen(true);
    setIsLoadingPreview(true);

    const result = await stickerPacksApi.getStickers(pack.name);
    if (result.success && result.data) {
      setPreviewStickers(result.data.stickers);
    } else {
      toast.error(result.error || "加载失败");
    }
    setIsLoadingPreview(false);
  };

  const handleExportPack = async (pack: StickerPack) => {
    setIsExportingPack(true);
    const loadingToast = toast.loading(
      `正在导出 ${pack.title || pack.name}...`,
      { description: "正在转换贴纸格式，请稍候" }
    );
    try {
      const token = localStorage.getItem("bot_admin_token");
      const url = stickerPacksApi.exportPackUrl(pack.name);
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${pack.name}_stickers_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success("贴纸包已导出", { id: loadingToast });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败", { id: loadingToast });
    } finally {
      setIsExportingPack(false);
    }
  };

  // 导出贴纸
  const handleExport = async () => {
    if (stickers.length === 0) {
      toast.error("没有可导出的贴纸");
      return;
    }
    setIsExporting(true);
    const loadingToast = toast.loading(
      `正在导出 ${stickers.length} 个贴纸...`,
      { description: "正在打包贴纸文件，请稍候" }
    );
    try {
      const token = localStorage.getItem("bot_admin_token");
      const url = `${BACKEND_URL}/api/stickers/export`;
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // 下载文件
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `stickers_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success("贴纸导出成功", { id: loadingToast });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败", { id: loadingToast });
    } finally {
      setIsExporting(false);
    }
  };

  // 导入贴纸
  const handleImport = async () => {
    if (importFiles.length === 0) {
      toast.error("请选择图片文件");
      return;
    }
    if (importMode === "new" && !importTitle.trim()) {
      toast.error("请输入贴纸包名称");
      return;
    }
    if (importMode === "existing" && !importPackName) {
      toast.error("请选择要导入的贴纸包");
      return;
    }

    setIsImporting(true);
    try {
      const result = await stickersApi.import(importFiles, importTitle, importEmoji, {
        packMode: importMode,
        packName: importMode === "existing" ? importPackName : undefined,
      });
      if (result.success && result.data) {
        setImportResult({
          success: true,
          mode: result.data.mode,
          packName: result.data.packName,
          packTitle: result.data.packTitle,
          link: result.data.link,
          stickerCount: result.data.stickerCount,
          errors: result.data.errors,
        });
        if (result.data.mode === "existing") {
          toast.success(`成功添加 ${result.data.stickerCount} 个贴纸到现有贴纸包`);
        } else {
          toast.success(`成功创建贴纸包，共 ${result.data.stickerCount} 个贴纸`);
        }
        loadData();
      } else {
        toast.error(result.error || "导入失败");
        setImportResult({ success: false });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
      setImportResult({ success: false });
    } finally {
      setIsImporting(false);
    }
  };

  // 重置导入对话框
  const resetImportDialog = () => {
    setImportFiles([]);
    setImportTitle("");
    setImportEmoji("😀");
    setImportMode("new");
    setImportPackName("");
    setImportResult(null);
    setIsImportOpen(false);
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // 过滤非图片文件
    const validFiles = files.filter(
      (f) => f.type === "image/png" || f.type === "image/webp"
    );
    if (validFiles.length !== files.length) {
      toast.warning("部分文件已过滤，只支持 PNG 和 WebP 格式");
    }
    setImportFiles(validFiles);
  };

  const openStickerDetail = (sticker: Sticker) => {
    setSelectedSticker(sticker);
    setEditTags(sticker.tags?.join(" ") || "");
    setIsDetailOpen(true);
  };

  // 过滤贴纸
  const filteredStickers = stickers.filter(sticker => {
    // 分组过滤
    if (selectedGroup && sticker.groupId !== selectedGroup) {
      return false;
    }
    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        (sticker.emoji?.includes(query)) ||
        (sticker.setName?.toLowerCase().includes(query)) ||
        (sticker.tags?.some(t => t.toLowerCase().includes(query)))
      );
    }
    return true;
  });

  const getStickerTypeLabel = (sticker: Sticker) => {
    if (sticker.isAnimated) return "动态";
    if (sticker.isVideo) return "视频";
    return "静态";
  };

  const staticStickerPacks = stickerPacks.filter(
    (pack) => !pack.stickerType || pack.stickerType === "static"
  );

  if (isLoading) {
    return <StickersSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <StickerIcon className="w-6 h-6 text-primary" />
            贴纸管理
          </h1>
          <p className="text-muted-foreground mt-1">管理贴纸收藏和自定义贴纸包</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Tabs: Stickers vs Packs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "stickers" | "packs")} className="w-full">
        <TabsList>
          <TabsTrigger value="stickers" className="flex items-center gap-2">
            <StickerIcon className="w-4 h-4" />
            贴纸收藏 ({stickers.length})
          </TabsTrigger>
          <TabsTrigger value="packs" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            我的贴纸包 ({stickerPacks.length})
          </TabsTrigger>
        </TabsList>

        {/* Stickers Tab Content */}
        <TabsContent value="stickers" className="mt-4 space-y-4">
          {/* Import/Export Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(true)}
            >
              <Upload className="w-4 h-4 mr-1" />
              导入
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting || stickers.length === 0}
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              导出
            </Button>
            <Badge variant="outline" className="px-3 py-1">
              {stickers.length} 个贴纸
            </Badge>
          </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索表情、贴纸包、标签..."
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full max-w-full overflow-x-auto flex-nowrap justify-start">
          <TabsTrigger
            value="all"
            onClick={() => setSelectedGroup(null)}
            className="flex items-center gap-2"
          >
            <StickerIcon className="w-4 h-4" />
            全部 ({stickers.length})
          </TabsTrigger>
          {groups.map((group) => (
            <TabsTrigger
              key={group.id}
              value={group.id}
              onClick={() => setSelectedGroup(group.id)}
              className="flex items-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              {group.name} ({group.count || 0})
            </TabsTrigger>
          ))}
          <TabsTrigger
            value="add-group"
            onClick={() => setIsAddGroupOpen(true)}
            className="text-muted-foreground"
          >
            + 新建分组
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {renderStickerGrid()}
        </TabsContent>

        {groups.map((group) => (
          <TabsContent key={group.id} value={group.id} className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">{group.name}</h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDeleteGroup(group.id)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                删除分组
              </Button>
            </div>
            {renderStickerGrid()}
          </TabsContent>
        ))}
      </Tabs>
      </TabsContent>

        {/* Sticker Packs Tab Content */}
        <TabsContent value="packs" className="mt-4">
          {stickerPacks.length === 0 ? (
            <Card className="p-8 text-center">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无贴纸包</h3>
              <p className="text-muted-foreground mb-4">
                在 Telegram Bot 中使用 /newpack 命令创建贴纸包
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stickerPacks.map((pack) => {
                const typeIcon = pack.stickerType === 'animated' ? '✨' : pack.stickerType === 'video' ? '🎬' : '🖼️';
                const typeLabel = pack.stickerType === 'animated' ? '动态' : pack.stickerType === 'video' ? '视频' : '静态';
                return (
                  <Card key={pack.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <span>{typeIcon}</span>
                          {pack.title}
                        </span>
                        <Badge variant="secondary">{typeLabel}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{pack.stickerCount} 个贴纸</span>
                        <span>{new Date(pack.createdAt).toLocaleDateString("zh-CN")}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handlePreviewPack(pack)}
                        >
                          <StickerIcon className="w-4 h-4 mr-1" />
                          预览
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportPack(pack)}
                          disabled={isExportingPack}
                        >
                          <ImageDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a
                            href={`https://t.me/addstickers/${pack.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (confirm("确定删除此贴纸包记录？（Telegram上的贴纸包不会被删除）")) {
                              const result = await stickerPacksApi.delete(pack.name);
                              if (result.success) {
                                setStickerPacks(stickerPacks.filter(p => p.id !== pack.id));
                                toast.success("贴纸包记录已删除");
                              } else {
                                toast.error(result.error || "删除失败");
                              }
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Sticker Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedSticker?.emoji || "🎨"}</span>
              贴纸详情
            </DialogTitle>
          </DialogHeader>
          {selectedSticker && (
            <div className="space-y-4">
              {/* Sticker Preview */}
              <div className="flex justify-center p-4 bg-accent/30 rounded-xl">
                <div className="text-6xl">{selectedSticker.emoji || "🎨"}</div>
              </div>

              {/* Info */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">贴纸包</span>
                  <span>{selectedSticker.setName || "单独贴纸"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">类型</span>
                  <Badge variant="secondary">{getStickerTypeLabel(selectedSticker)}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">使用次数</span>
                  <span>{selectedSticker.usageCount || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">收藏时间</span>
                  <span>{new Date(selectedSticker.createdAt).toLocaleDateString("zh-CN")}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-2">
                  <span className="text-muted-foreground mr-2">标签:</span>
                  {selectedSticker.tags?.length > 0 ? (
                    selectedSticker.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-xs">无标签</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setIsEditTagsOpen(true)}
                >
                  <Tag className="w-4 h-4 mr-2" />
                  编辑标签
                </Button>
                <div className="flex gap-2">
                  {groups.map((group) => (
                    <Button
                      key={group.id}
                      variant={selectedSticker.groupId === group.id ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleMoveToGroup(
                        selectedSticker.groupId === group.id ? null : group.id
                      )}
                    >
                      <FolderOpen className="w-3 h-3 mr-1" />
                      {group.name}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setIsDeleteOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除贴纸
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Tags Dialog */}
      <Dialog open={isEditTagsOpen} onOpenChange={setIsEditTagsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑标签</DialogTitle>
            <DialogDescription>多个标签用空格或逗号分隔</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="搞笑 常用 表情包"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTagsOpen(false)}>取消</Button>
            <Button onClick={handleUpdateTags}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个贴纸吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Group Dialog */}
      <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建分组</DialogTitle>
            <DialogDescription>为贴纸创建一个新分组</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>分组名称</Label>
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="例如: 常用表情"
              className="mt-2"
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddGroupOpen(false)}>取消</Button>
            <Button onClick={handleCreateGroup}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={(open) => !open && resetImportDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              导入贴纸
            </DialogTitle>
            <DialogDescription>
              上传图片创建 Telegram 贴纸包，支持 PNG/WebP/JPG/JPEG/GIF，系统会自动转换为贴纸格式
            </DialogDescription>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-4 py-4">
              <div>
                <Label>导入方式 *</Label>
                <Tabs
                  value={importMode}
                  onValueChange={(v) => {
                    setImportMode(v as "new" | "existing");
                    setImportResult(null);
                  }}
                  className="mt-2"
                >
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="new">新建贴纸包</TabsTrigger>
                    <TabsTrigger value="existing">导入到已有贴纸包</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {importMode === "new" ? (
                <div>
                  <Label>贴纸包名称 *</Label>
                  <Input
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder="例如: 我的表情包"
                    className="mt-2"
                  />
                </div>
              ) : (
                <div>
                  <Label>选择已有贴纸包 *</Label>
                  <select
                    value={importPackName}
                    onChange={(e) => setImportPackName(e.target.value)}
                    className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">请选择贴纸包</option>
                    {staticStickerPacks.map((pack) => (
                      <option key={pack.id} value={pack.name}>
                        {pack.title} ({pack.stickerCount}/120)
                      </option>
                    ))}
                  </select>
                  {staticStickerPacks.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      当前没有可导入的静态贴纸包，请先创建一个静态贴纸包
                    </p>
                  )}
                </div>
              )}

              <div>
                <Label>默认表情</Label>
                <Input
                  value={importEmoji}
                  onChange={(e) => setImportEmoji(e.target.value)}
                  placeholder="😀"
                  className="mt-2"
                  maxLength={8}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  所有贴纸将使用此表情作为关联表情
                </p>
              </div>

              <div>
                <Label>选择图片 *</Label>
                <div className="mt-2">
                  <Input
                    type="file"
                    accept="image/png,image/webp"
                    multiple
                    onChange={handleFileSelect}
                    className="file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:text-sm hover:file:bg-primary/90"
                  />
                </div>
                {importFiles.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    已选择 {importFiles.length} 个文件
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  支持批量选择，单个文件不超过 512KB，最多 120 个
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center">
              {importResult.success ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <StickerIcon className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">导入成功</h3>
                    <p className="text-muted-foreground">
                      {importResult.mode === "existing"
                        ? `成功添加 ${importResult.stickerCount} 个贴纸到 ${importResult.packTitle || importResult.packName}`
                        : `成功创建贴纸包，共 ${importResult.stickerCount} 个贴纸`}
                    </p>
                  </div>
                  {importResult.link && (
                    <Button asChild className="mt-2">
                      <a href={importResult.link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        在 Telegram 中查看
                      </a>
                    </Button>
                  )}
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="text-left mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm">
                      <p className="font-medium mb-1">部分贴纸添加失败：</p>
                      <ul className="list-disc list-inside">
                        {importResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li>...还有 {importResult.errors.length - 5} 个错误</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">创建失败</h3>
                    <p className="text-muted-foreground">请检查图片格式和尺寸后重试</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!importResult ? (
              <>
                <Button variant="outline" onClick={resetImportDialog}>
                  取消
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={
                    isImporting ||
                    importFiles.length === 0 ||
                    (importMode === "new" ? !importTitle.trim() : !importPackName)
                  }
                >
                  {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {importMode === "new" ? "创建贴纸包" : "导入到贴纸包"}
                </Button>
              </>
            ) : (
              <Button onClick={resetImportDialog}>关闭</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pack Preview Dialog */}
      <Dialog open={isPackPreviewOpen} onOpenChange={setIsPackPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewPack && (
                <>
                  <span>
                    {previewPack.stickerType === 'animated' ? '✨' : previewPack.stickerType === 'video' ? '🎬' : '🖼️'}
                  </span>
                  {previewPack.title}
                  <Badge variant="secondary" className="ml-2">
                    {previewPack.stickerType === 'animated' ? '动态' : previewPack.stickerType === 'video' ? '视频' : '静态'}
                  </Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {previewPack && `共 ${previewStickers.length || previewPack.stickerCount} 个贴纸`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">加载中...</span>
              </div>
            ) : previewStickers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>无法加载贴纸内容</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {previewStickers.map((sticker, index) => (
                  <div
                    key={sticker.fileId || index}
                    className="aspect-square rounded-xl bg-accent/30 hover:bg-accent/50 transition-all flex items-center justify-center overflow-hidden"
                    title={sticker.emoji}
                  >
                    {sticker.fileUrl ? (
                      <img
                        src={`${BACKEND_URL}${sticker.fileUrl}`}
                        alt={sticker.emoji}
                        className="w-full h-full object-contain"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.error-placeholder')) {
                            const placeholder = document.createElement('span');
                            placeholder.className = 'error-placeholder text-2xl opacity-50';
                            placeholder.textContent = sticker.emoji || '❌';
                            placeholder.title = '加载失败';
                            parent.appendChild(placeholder);
                          }
                        }}
                      />
                    ) : (
                      <span className="text-2xl">{sticker.emoji || '🎨'}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            {previewPack && (
              <Button
                variant="outline"
                onClick={() => handleExportPack(previewPack)}
                disabled={isExportingPack}
              >
                <ImageDown className="w-4 h-4 mr-2" />
                下载贴纸包
              </Button>
            )}
            {previewPack && (
              <Button variant="outline" asChild>
                <a
                  href={`https://t.me/addstickers/${previewPack.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  在 Telegram 中添加
                </a>
              </Button>
            )}
            <Button onClick={() => setIsPackPreviewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderStickerGrid() {
    if (filteredStickers.length === 0) {
      return (
        <Card className="py-12">
          <CardContent className="text-center text-muted-foreground">
            <StickerIcon className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>暂无贴纸</p>
            <p className="text-sm mt-2">在 Telegram 中将贴纸转发给 Bot 即可收藏</p>
          </CardContent>
        </Card>
      );
    }

    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3">
          {filteredStickers.map((sticker) => (
            <div
              key={sticker.id}
              className="aspect-square rounded-xl bg-accent/30 hover:bg-accent/50 transition-all cursor-pointer flex items-center justify-center text-3xl hover:scale-105 active:scale-95"
              onClick={() => openStickerDetail(sticker)}
              title={sticker.setName || sticker.emoji || "贴纸"}
            >
              {sticker.emoji || "🎨"}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {filteredStickers.map((sticker) => (
          <Card
            key={sticker.id}
            className="cursor-pointer hover:bg-accent/30 transition-colors"
            onClick={() => openStickerDetail(sticker)}
          >
            <CardContent className="p-3 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/30 flex items-center justify-center text-2xl">
                {sticker.emoji || "🎨"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{sticker.setName || "单独贴纸"}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-xs">{getStickerTypeLabel(sticker)}</Badge>
                  <span>使用 {sticker.usageCount || 0} 次</span>
                  {sticker.tags?.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {sticker.tags.slice(0, 2).join(", ")}
                      {sticker.tags.length > 2 && "..."}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(sticker.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
};

export default StickersPage;
