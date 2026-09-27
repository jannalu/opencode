export type SelectionLocation = {
  relativePath: string
  languageId: string
  text: string
  startLine: number
  endLine: number
  endCharacter: number
}

export type CursorContext = {
  relativePath: string
  languageId: string
  text: string
  startLine: number
  endLine: number
  cursorLine: number
  cursorCharacter: number
}

export function selectedLineRange(input: Pick<SelectionLocation, "startLine" | "endLine" | "endCharacter">) {
  const start = input.startLine + 1
  const end = input.endCharacter === 0 && input.endLine > input.startLine ? input.endLine : input.endLine + 1
  return { start, end }
}

export function buildExplanationPrompt(input: SelectionLocation) {
  const lines = selectedLineRange(input)
  const range = lines.start === lines.end ? `#L${lines.start}` : `#L${lines.start}-${lines.end}`
  const fence = codeFence(input.text)

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

export function buildCodeSuggestionPrompt(input: CursorContext) {
  const fence = codeFence(input.text)

  return [
    "Suggest code for the student's current cursor position.",
    "Use the surrounding code below and inspect other relevant project files with read-only tools if needed.",
    "Do not modify any files. Return the suggested code first, followed by a clear, beginner-friendly explanation",
    "of what it does and why it works. Avoid unnecessary jargon, and define any technical term you must use.",
    "",
    `File: @${input.relativePath}#L${input.cursorLine + 1}`,
    `Cursor: line ${input.cursorLine + 1}, column ${input.cursorCharacter + 1}`,
    `Context lines: ${input.startLine + 1}-${input.endLine + 1}`,
    "",
    "Surrounding code (including any unsaved changes):",
    `${fence}${input.languageId}`,
    input.text,
    fence,
  ].join("\n")
}

function codeFence(text: string) {
  const longestFence = Math.max(2, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length))
  return "`".repeat(longestFence + 1)
}
