import * as assert from "node:assert/strict"
import { buildCodeSuggestionPrompt, buildExplanationPrompt, selectedLineRange } from "../explain"

suite("Explain selected code", () => {
  test("uses the selected line range", () => {
    assert.deepEqual(selectedLineRange({ startLine: 3, endLine: 5, endCharacter: 8 }), { start: 4, end: 6 })
  })

  test("does not include the next line when a selection ends at column zero", () => {
    assert.deepEqual(selectedLineRange({ startLine: 3, endLine: 5, endCharacter: 0 }), { start: 4, end: 5 })
  })

  test("includes the file reference, selected text, and learning guidance", () => {
    const prompt = buildExplanationPrompt({
      relativePath: "src/example.ts",
      languageId: "typescript",
      text: "const answer = 42",
      startLine: 6,
      endLine: 6,
      endCharacter: 17,
    })

    assert.match(prompt, /@src\/example\.ts#L7/)
    assert.match(prompt, /const answer = 42/)
    assert.match(prompt, /beginner-friendly/)
    assert.match(prompt, /Do not modify any files/)
  })

  test("formats a multi-line file reference for opencode", () => {
    const prompt = buildExplanationPrompt({
      relativePath: "src/example.ts",
      languageId: "typescript",
      text: "const first = 1\nconst second = 2",
      startLine: 3,
      endLine: 4,
      endCharacter: 16,
    })

    assert.match(prompt, /@src\/example\.ts#L4-5/)
  })

  test("uses a code fence longer than fences in the selected text", () => {
    const prompt = buildExplanationPrompt({
      relativePath: "README.md",
      languageId: "markdown",
      text: "```ts\nconst value = true\n```",
      startLine: 0,
      endLine: 2,
      endCharacter: 3,
    })

    assert.match(prompt, /````markdown/)
    assert.ok(prompt.endsWith("````"))
  })

  test("builds a beginner-friendly suggestion request with cursor context", () => {
    const prompt = buildCodeSuggestionPrompt({
      relativePath: "src/example.ts",
      languageId: "typescript",
      text: "function total(values: number[]) {\n  \n}",
      startLine: 9,
      endLine: 11,
      cursorLine: 10,
      cursorCharacter: 2,
    })

    assert.match(prompt, /@src\/example\.ts#L11/)
    assert.match(prompt, /Cursor: line 11, column 3/)
    assert.match(prompt, /Context lines: 10-12/)
    assert.match(prompt, /function total/)
    assert.match(prompt, /beginner-friendly explanation/)
    assert.match(prompt, /Do not modify any files/)
  })
})
