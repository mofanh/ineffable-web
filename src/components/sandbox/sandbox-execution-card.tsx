import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PlayIcon, SquareIcon, TerminalIcon } from "lucide-react"

export type SandboxOperationMode = "write_file" | "read_file" | "list_dir" | "command"

type SandboxExecutionCardProps = {
  operationMode: SandboxOperationMode
  path: string
  content: string
  command: string
  commandArgs: string
  commandProfile: string
  cwd: string
  isSubmitting?: boolean
  canSubmit: boolean
  onOperationModeChange: (mode: SandboxOperationMode) => void
  onPathChange: (value: string) => void
  onContentChange: (value: string) => void
  onCommandChange: (value: string) => void
  onCommandArgsChange: (value: string) => void
  onCommandProfileChange: (value: string) => void
  onCwdChange: (value: string) => void
  onSubmit: () => void
  onInterruptLast: () => void
}

export function SandboxExecutionCard({
  operationMode,
  path,
  content,
  command,
  commandArgs,
  commandProfile,
  cwd,
  isSubmitting,
  canSubmit,
  onOperationModeChange,
  onPathChange,
  onContentChange,
  onCommandChange,
  onCommandArgsChange,
  onCommandProfileChange,
  onCwdChange,
  onSubmit,
  onInterruptLast,
}: SandboxExecutionCardProps) {
  const isCommand = operationMode === "command"
  const isWrite = operationMode === "write_file"

  return (
    <Card className="bg-muted/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TerminalIcon className="size-4" />
          Execution
        </CardTitle>
        <CardDescription>
          创建文件或命令执行请求。命令请求会先进入 approval。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>操作类型</Label>
            <Select
              value={operationMode}
              onValueChange={(value) => onOperationModeChange(value as SandboxOperationMode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="write_file">write_file</SelectItem>
                <SelectItem value="read_file">read_file</SelectItem>
                <SelectItem value="list_dir">list_dir</SelectItem>
                <SelectItem value="command">command</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sandbox-path">{isCommand ? "cwd" : "path"}</Label>
            <Input
              id="sandbox-path"
              value={isCommand ? cwd : path}
              onChange={(event) =>
                isCommand ? onCwdChange(event.target.value) : onPathChange(event.target.value)
              }
              placeholder="/tmp/ineffable-sandbox-project"
            />
          </div>
        </div>

        {isWrite ? (
          <div className="space-y-2">
            <Label htmlFor="sandbox-file-content">文件内容</Label>
            <Textarea
              id="sandbox-file-content"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              className="min-h-24"
            />
          </div>
        ) : null}

        {isCommand ? (
          <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>Profile</Label>
              <Select value={commandProfile} onValueChange={onCommandProfileChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="safe_readonly">safe_readonly</SelectItem>
                  <SelectItem value="safe_dev_basic">safe_dev_basic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sandbox-command">Command</Label>
              <Input
                id="sandbox-command"
                value={command}
                onChange={(event) => onCommandChange(event.target.value)}
                placeholder="pwd"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sandbox-command-args">Args</Label>
              <Input
                id="sandbox-command-args"
                value={commandArgs}
                onChange={(event) => onCommandArgsChange(event.target.value)}
                placeholder="space separated, no shell"
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onSubmit} disabled={!canSubmit || isSubmitting}>
            <PlayIcon />
            Submit
          </Button>
          <Button type="button" variant="outline" onClick={onInterruptLast}>
            <SquareIcon />
            Interrupt last
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
