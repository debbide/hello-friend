import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { notesApi, remindersApi, Note, Reminder } from "@/lib/api/backend";
import { Bell, StickyNote, Plus, Trash2, Clock, RefreshCw, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const RemindersSkeleton = () => (
  <div className="space-y-6 animate-fade-in">
    <div className="flex items-center justify-between">
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-52 mt-2" />
      </div>
      <Skeleton className="h-8 w-44" />
    </div>
    <Skeleton className="h-10 w-full max-w-md" />
    <div className="space-y-4">
      <Card>
        <CardHeader><Skeleton className="h-5 w-24" /></CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-accent/30">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  </div>
);

const RemindersPage = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isAddReminderOpen, setIsAddReminderOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newReminder, setNewReminder] = useState({ content: "", time: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [notesResult, remindersResult] = await Promise.all([
      notesApi.list(),
      remindersApi.list(),
    ]);
    if (notesResult.success && notesResult.data) {
      setNotes(notesResult.data);
    }
    if (remindersResult.success && remindersResult.data) {
      setReminders(remindersResult.data);
    }
    setIsLoading(false);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error("请输入备忘内容");
      return;
    }
    const result = await notesApi.create(newNote);
    if (result.success) {
      await loadData();
      setNewNote("");
      setIsAddNoteOpen(false);
      toast.success("备忘已添加");
    } else {
      toast.error(result.error || "添加失败");
    }
  };

  const handleToggleNote = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const result = await notesApi.update(id, { completed: !note.completed });
    if (result.success) {
      setNotes(notes.map(n => n.id === id ? { ...n, completed: !n.completed } : n));
    }
  };

  const handleDeleteNote = async (id: string) => {
    const result = await notesApi.delete(id);
    if (result.success) {
      setNotes(notes.filter(note => note.id !== id));
      toast.success("备忘已删除");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const handleAddReminder = async () => {
    if (!newReminder.content.trim() || !newReminder.time) {
      toast.error("请填写完整信息");
      return;
    }
    const result = await remindersApi.create({
      content: newReminder.content,
      triggerAt: new Date(newReminder.time).toISOString(),
      repeat: "once",
    });
    if (result.success) {
      await loadData();
      setNewReminder({ content: "", time: "" });
      setIsAddReminderOpen(false);
      toast.success("提醒已添加");
    } else {
      toast.error(result.error || "添加失败");
    }
  };

  const handleDeleteReminder = async (id: string) => {
    const result = await remindersApi.delete(id);
    if (result.success) {
      setReminders(reminders.filter(r => r.id !== id));
      toast.success("提醒已删除");
    } else {
      toast.error(result.error || "删除失败");
    }
  };

  const getRepeatLabel = (repeat?: Reminder["repeat"]) => {
    switch (repeat) {
      case "daily": return "每天";
      case "weekly": return "每周";
      default: return "一次";
    }
  };

  const getStatusBadge = (status: Reminder["status"]) => {
    switch (status) {
      case "pending":
        return <Badge variant="default" className="bg-blue-500/20 text-blue-600 border-blue-500/30">待触发</Badge>;
      case "triggered":
        return <Badge variant="secondary">已完成</Badge>;
      case "cancelled":
        return <Badge variant="outline">已取消</Badge>;
    }
  };

  const activeNotes = notes.filter(n => !n.completed);
  const completedNotes = notes.filter(n => n.completed);
  const pendingReminders = reminders.filter(r => r.status === "pending");

  if (isLoading) {
    return <RemindersSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="text-2xl">⏰</span> 备忘提醒
          </h1>
          <p className="text-muted-foreground mt-1">管理备忘录和定时提醒</p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          {activeNotes.length} 条备忘 · {pendingReminders.length} 个待提醒
        </Badge>
      </div>

      <Tabs defaultValue="notes" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="notes" className="flex items-center gap-2">
            <StickyNote className="w-4 h-4" />
            备忘录 ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            提醒 ({reminders.length})
          </TabsTrigger>
        </TabsList>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddNoteOpen} onOpenChange={setIsAddNoteOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  添加备忘
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加备忘</DialogTitle>
                  <DialogDescription>记录一条新的备忘事项</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="输入备忘内容..."
                    onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddNoteOpen(false)}>取消</Button>
                  <Button onClick={handleAddNote}>添加</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Active Notes */}
          {activeNotes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📋 待办事项</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeNotes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-accent/30 hover:bg-accent/50 transition-colors group"
                  >
                    <Checkbox
                      checked={note.completed}
                      onCheckedChange={() => handleToggleNote(note.id)}
                    />
                    <span className="flex-1 text-sm text-foreground">{note.content}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Completed Notes */}
          {completedNotes.length > 0 && (
            <Card className="opacity-60">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="w-4 h-4" /> 已完成
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {completedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 group"
                  >
                    <Checkbox
                      checked={note.completed}
                      onCheckedChange={() => handleToggleNote(note.id)}
                    />
                    <span className="flex-1 text-sm text-muted-foreground line-through">{note.content}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      onClick={() => handleDeleteNote(note.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {notes.length === 0 && (
            <Card className="py-12">
              <CardContent className="text-center text-muted-foreground">
                <StickyNote className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无备忘</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Dialog open={isAddReminderOpen} onOpenChange={setIsAddReminderOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  添加提醒
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加提醒</DialogTitle>
                  <DialogDescription>设置一个定时提醒</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>提醒内容</Label>
                    <Input
                      value={newReminder.content}
                      onChange={(e) => setNewReminder({ ...newReminder, content: e.target.value })}
                      placeholder="喝水 💧"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>提醒时间</Label>
                    <Input
                      type="datetime-local"
                      value={newReminder.time}
                      onChange={(e) => setNewReminder({ ...newReminder, time: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddReminderOpen(false)}>取消</Button>
                  <Button onClick={handleAddReminder}>添加</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-3">
            {reminders.map((reminder) => (
              <Card key={reminder.id} className={reminder.status !== "pending" ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      reminder.status === "pending" ? "bg-primary/10" : "bg-muted"
                    }`}>
                      <Bell className={`w-5 h-5 ${
                        reminder.status === "pending" ? "text-primary" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{reminder.content}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(reminder.triggerAt).toLocaleString("zh-CN")}
                        </span>
                        <span className="flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" />
                          {getRepeatLabel(reminder.repeat)}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(reminder.status)}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteReminder(reminder.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {reminders.length === 0 && (
            <Card className="py-12">
              <CardContent className="text-center text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>暂无提醒</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RemindersPage;
