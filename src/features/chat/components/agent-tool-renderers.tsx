import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ToolCallView } from "@/features/chat/chat-pane-state"
import { objectValue, parseJsonObject, stringValue } from "@/features/chat/model/chat-parsing"
import { normalizeAppError } from "@/lib/app/api-errors"
import { i18n } from "@/lib/i18n/i18n"
import { cn } from "@/lib/utils"
import { CircleHelpIcon, SendIcon } from "lucide-react"
import { ToolCallShell } from "@/features/chat/components/tool-call-shell"

type UserInputOption = {
  label: string
  description: string
  recommended: boolean
}

type UserInputQuestion = {
  id: string
  header: string
  question: string
  options: UserInputOption[]
}

export type AgentUserInputResponse = {
  toolId: string
  runId: string
  input: string
}

function cleanRecommendedLabel(label: string) {
  return label.replace(/\s*\((?:recommended|推荐)\)\s*$/i, "").trim()
}

function parseQuestions(raw: unknown): UserInputQuestion[] {
  const root = objectValue(raw)
  const blockingNeed = objectValue(root?.blocking_need)
  const questions = Array.isArray(root?.questions)
    ? root.questions
    : Array.isArray(blockingNeed?.questions)
      ? blockingNeed.questions
      : []

  return questions.flatMap((candidate, questionIndex) => {
    const question = objectValue(candidate)
    if (!question) return []
    const options = Array.isArray(question.options)
      ? question.options.flatMap((optionCandidate, optionIndex) => {
          const option = objectValue(optionCandidate)
          const rawLabel = stringValue(option?.label).trim()
          if (!rawLabel) return []
          return [
            {
              label: cleanRecommendedLabel(rawLabel),
              description: stringValue(option?.description).trim(),
              recommended:
                option?.recommended === true ||
                /\((?:recommended|推荐)\)\s*$/i.test(rawLabel) ||
                optionIndex === 0,
            },
          ]
        })
      : []
    const questionText = stringValue(question.question).trim()
    if (!questionText || options.length === 0) return []
    return [
      {
        id: stringValue(question.id).trim() || `question_${questionIndex + 1}`,
        header: stringValue(question.header).trim(),
        question: questionText,
        options,
      },
    ]
  })
}

function requestUserInputQuestions(tool: ToolCallView) {
  const input = parseJsonObject(tool.input)
  const inputQuestions = parseQuestions(input)
  if (inputQuestions.length > 0) return inputQuestions

  const output = parseJsonObject(tool.output)
  return parseQuestions(output)
}

function buildResolutionInput(
  questions: UserInputQuestion[],
  selections: Record<string, string>,
  customAnswers: Record<string, string>
) {
  return questions
    .map((question) => {
      const selected = selections[question.id]
      const answer =
        selected === "__other__" ? customAnswers[question.id]?.trim() : selected
      if (questions.length === 1) return answer ?? ""
      return `${question.header || question.question}: ${answer ?? ""}`
    })
    .join("\n")
}

function restoredAnswerState(
  questions: UserInputQuestion[],
  answer: string | null | undefined
) {
  const selections: Record<string, string> = {}
  const customAnswers: Record<string, string> = {}
  if (!answer?.trim()) {
    return { selections, customAnswers }
  }

  const answers =
    questions.length === 1
      ? [answer.trim()]
      : answer.split("\n").map((line, index) => {
          const question = questions[index]
          const prefix = `${question?.header || question?.question}:`
          return line.startsWith(prefix) ? line.slice(prefix.length).trim() : line.trim()
        })

  questions.forEach((question, index) => {
    const restored = answers[index] ?? ""
    const option = question.options.find((candidate) => candidate.label === restored)
    if (option) {
      selections[question.id] = option.label
      return
    }
    if (restored) {
      selections[question.id] = "__other__"
      customAnswers[question.id] = restored
    }
  })

  return { selections, customAnswers }
}

function RequestUserInputCard({
  tool,
  canRespond,
  onSubmit,
}: {
  tool: ToolCallView
  canRespond: boolean
  onSubmit?: (response: AgentUserInputResponse) => Promise<void>
}) {
  const questions = React.useMemo(() => requestUserInputQuestions(tool), [tool])
  const restoredAnswer = React.useMemo(
    () => restoredAnswerState(questions, tool.answer),
    [questions, tool.answer]
  )
  const [selections, setSelections] = React.useState<Record<string, string>>(
    restoredAnswer.selections
  )
  const [customAnswers, setCustomAnswers] = React.useState<Record<string, string>>(
    restoredAnswer.customAnswers
  )
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  const isAnswered = tool.status === "succeeded" && Boolean(tool.answer)
  const isInteractive =
    tool.status === "waiting" && canRespond && Boolean(onSubmit) && Boolean(tool.runId)
  const isComplete = questions.every((question) => {
    const selected = selections[question.id]
    return Boolean(
      selected &&
        (selected !== "__other__" || customAnswers[question.id]?.trim())
    )
  })

  return (
    <ToolCallShell
      tool={tool}
      title={i18n.t("chat.agent.userInputTitle")}
      icon={
        <CircleHelpIcon className="size-3.5 flex-none text-amber-600 dark:text-amber-400" />
      }
      defaultOpen={tool.status === "waiting"}
      autoOpenActive={false}
      autoOpenWaiting
      lockOpen={isInteractive}
      className="rounded-xl border border-border/70 bg-muted/20 p-3"
    >
      <div className="space-y-4 pr-1">
        {questions.map((question, questionIndex) => (
          <fieldset key={question.id} className="space-y-2.5">
            <legend className="w-full">
              <span className="flex items-center gap-2">
                {question.header ? (
                  <Badge
                    variant="outline"
                    className="h-5 rounded-full border-amber-500/25 bg-background/70 px-1.5 text-[10px] text-amber-700 dark:text-amber-400"
                  >
                    {question.header}
                  </Badge>
                ) : null}
                {questions.length > 1 ? (
                  <span className="text-[10px] text-foreground/45">
                    {questionIndex + 1}/{questions.length}
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 block text-[13px] font-medium leading-5 text-foreground/85">
                {question.question}
              </span>
            </legend>

            <div className="grid gap-2" role="radiogroup">
              {question.options.map((option) => {
                const selected = selections[question.id] === option.label
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!isInteractive || isSubmitting}
                    onClick={() => {
                      setSelections((current) => ({
                        ...current,
                        [question.id]: option.label,
                      }))
                      setError("")
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-foreground/35 bg-muted/70"
                        : "border-border/70 bg-background/55 hover:border-foreground/20 hover:bg-background/80",
                      (!isInteractive || isSubmitting) && "cursor-default"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-3.5 rounded-full border",
                          selected
                            ? "border-amber-600 bg-amber-600 shadow-[inset_0_0_0_3px_var(--color-background)] dark:border-amber-400 dark:bg-amber-400"
                            : "border-foreground/25"
                        )}
                      />
                      <span className="font-medium text-foreground/82">{option.label}</span>
                      {option.recommended ? (
                        <Badge className="h-5 rounded-full border border-emerald-500/25 bg-foreground/5 px-1.5 text-[10px] text-emerald-700 shadow-none dark:text-emerald-400">
                          {i18n.t("chat.agent.recommended")}
                        </Badge>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="mt-1 block pl-5.5 text-[11px] leading-5 text-foreground/58">
                        {option.description}
                      </span>
                    ) : null}
                  </button>
                )
              })}

              <button
                type="button"
                role="radio"
                aria-checked={selections[question.id] === "__other__"}
                disabled={!isInteractive || isSubmitting}
                onClick={() =>
                  setSelections((current) => ({
                    ...current,
                    [question.id]: "__other__",
                  }))
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  selections[question.id] === "__other__"
                    ? "border-foreground/35 bg-muted/70"
                    : "border-border/70 bg-background/55 hover:border-foreground/20 hover:bg-background/80",
                  (!isInteractive || isSubmitting) && "cursor-default"
                )}
              >
                <span className="font-medium text-foreground/82">
                  {i18n.t("chat.agent.otherOption")}
                </span>
              </button>
              {selections[question.id] === "__other__" ? (
                <Input
                  value={customAnswers[question.id] ?? ""}
                  disabled={!isInteractive || isSubmitting}
                  placeholder={i18n.t("chat.agent.otherPlaceholder")}
                  onChange={(event) =>
                    setCustomAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))
                  }
                  className="h-9 bg-background/70 text-xs"
                />
              ) : null}
            </div>
          </fieldset>
        ))}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {isAnswered ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            {i18n.t("chat.agent.answerSubmitted")}
          </p>
        ) : isInteractive ? (
          <Button
            type="button"
            size="sm"
            disabled={!isComplete || isSubmitting}
            onClick={() => {
              if (!onSubmit || !isComplete) return
              setIsSubmitting(true)
              setError("")
              void onSubmit({
                toolId: tool.id,
                runId: tool.runId as string,
                input: buildResolutionInput(questions, selections, customAnswers),
              })
                .catch((submitError) => {
                  setError(
                    normalizeAppError(submitError, {
                      fallbackMessage: i18n.t("chat.agent.answerSubmitFailed"),
                    }).message
                  )
                })
                .finally(() => setIsSubmitting(false))
            }}
          >
            <SendIcon />
            {isSubmitting
              ? i18n.t("chat.agent.answerSubmitting")
              : i18n.t("chat.agent.submitAnswer")}
          </Button>
        ) : (
          <p className="text-xs text-foreground/55">
            {i18n.t("chat.agent.inputNoLongerActive")}
          </p>
        )}
      </div>
    </ToolCallShell>
  )
}

export type ToolRendererProps = {
  tool: ToolCallView
  canRespondToUserInput: boolean
  onSubmitUserInput?: (response: AgentUserInputResponse) => Promise<void>
}

type ToolRenderer = (props: ToolRendererProps) => React.ReactNode

const TOOL_RENDERERS: Record<string, ToolRenderer> = {
  request_user_input: ({
    tool,
    canRespondToUserInput,
    onSubmitUserInput,
  }) => (
    <RequestUserInputCard
      tool={tool}
      canRespond={canRespondToUserInput}
      onSubmit={onSubmitUserInput}
    />
  ),
}

export function renderSpecializedTool(props: ToolRendererProps) {
  return TOOL_RENDERERS[props.tool.name]?.(props) ?? null
}
