import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChatInterface } from "@/components/chat-interface"

// Sample messages for demo
const initialMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "请拆分任务 #102，按优先级给出执行计划。",
    senderName: "You",
    timestamp: "10:21",
  },
  {
    id: "2",
    role: "agent" as const,
    content: "已拆分为 4 个子任务，等待你确认优先级。",
    senderName: "planner-A",
    timestamp: "10:22",
    needsHumanInput: true,
  },
  {
    id: "3",
    role: "agent" as const,
    content: "API 已连通，是否现在切换 CLI 到纯 HTTP 模式？",
    senderName: "worker-B",
    timestamp: "10:24",
    needsHumanInput: true,
  },
]

const agents = [
  { name: "planner-A", role: "Planner", status: "Online", task: "分解任务 #102", lastHeartbeat: "10 秒前" },
  { name: "worker-B", role: "Worker", status: "Busy", task: "实现 world HTTP client", lastHeartbeat: "25 秒前" },
  { name: "worker-C", role: "Worker", status: "Offline", task: "等待任务", lastHeartbeat: "8 分钟前" },
]

const events = [
  "10:21 planner-A online",
  "10:22 task#88 started",
  "10:24 task#88 failed",
  "10:25 human replied",
]

export function App() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">World 控制台</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>协作总览</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">World: dev-local-01</span>
            <Badge variant="secondary">Connected</Badge>
            <Badge variant="outline">未处理提问: 3</Badge>
            <Button variant="outline">刷新</Button>
            <Button>发送消息</Button>
          </div>
        </header>

       <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <div className="bg-muted/50 aspect-video rounded-xl" />
            <div className="bg-muted/50 aspect-video rounded-xl" />
            <div className="bg-muted/50 aspect-video rounded-xl" />
          </div>
          <div className="bg-muted/50 min-h-screen flex-1 rounded-xl md:min-h-min" />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
