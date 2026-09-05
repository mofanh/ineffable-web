export function isActionablePreInput(input: {
  kind: string
  status: string
}): boolean {
  return input.kind === "pre_input" && input.status === "queued"
}
