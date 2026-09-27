export type SelectionLocation = {
  relativePath: string
  languageId: string
  text: string
  startLine: number
  endLine: number
  endCharacter: number
}

export function selectedLineRange(input: Pick<SelectionLocation, "startLine" | "endLine" | "endCharacter">) {
  const start = input.startLine + 1
  const end = input.endCharacter === 0 && input.endLine > input.startLine ? input.endLine : input.endLine + 1
  return { start, end }
}

export function buildExplanationPrompt(input: SelectionLocation) {
  const lines = selectedLineRange(input)
  const range = lines.start === lines.end ? `#L${lines.start}` : `#L${lines.start}-${lines.end}`
  const longestFence = Math.max(2, ...Array.from(input.text.matchAll(/`+/g), (match) => match[0].length))
  const fence = "`".repeat(longestFence + 1)

  return [
    "Explain the highlighted code in clear, beginner-friendly language.",
    "Describe what it does, why it works, and any important inputs, outputs, or side effects.",
    "Avoid unnecessary jargon, and define any technical term you must use. Do not modify any files.",
    "",
    `File: @${input.relativePath}${range}`,
    "",
    "Highlighted code (including any unsaved changes):",
    `${fence}${input.languageId}`,
    input.text,
    fence,
  ].join("\n")
}
