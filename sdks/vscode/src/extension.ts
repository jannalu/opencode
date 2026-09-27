// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"
import { buildExplanationPrompt } from "./explain"

const TERMINAL_NAME = "opencode"
const LEARN_TERMINAL_NAME = "opencode learn preview"
const LEARN_MODE_PREVIEW_KEY = "opencode.learnModePreview"
const SERVER_READY_RETRIES = 60
const SERVER_READY_DELAY_MS = 250
const TUI_READY_DELAY_MS = 500

export function activate(context: vscode.ExtensionContext) {
  let learnModePreview = context.workspaceState.get<boolean>(LEARN_MODE_PREVIEW_KEY, false)
  void vscode.commands.executeCommand("setContext", LEARN_MODE_PREVIEW_KEY, learnModePreview)

  const openNewTerminalDisposable = vscode.commands.registerCommand("opencode.openNewTerminal", async () => {
    await openTerminal()
  })

  const openTerminalDisposable = vscode.commands.registerCommand("opencode.openTerminal", async () => {
    // An opencode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (existingTerminal) {
      existingTerminal.show()
      return
    }

    await openTerminal()
  })

  let addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    const terminal = vscode.window.activeTerminal
    if (!terminal) {
      return
    }

    if (terminal.name === TERMINAL_NAME) {
      // @ts-ignore
      const port = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"]
      port ? await appendPrompt(parseInt(port), fileRef) : terminal.sendText(fileRef, false)
      terminal.show()
    }
  })

  const explainSelectionDisposable = vscode.commands.registerCommand("opencode.explainSelection", async () => {
    if (!learnModePreview) {
      await vscode.window.showInformationMessage("Enable Learn Mode Preview before asking opencode to explain code.")
      return
    }

    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor || activeEditor.selection.isEmpty) {
      await vscode.window.showInformationMessage("Highlight some code before asking opencode to explain it.")
      return
    }

    const document = activeEditor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      await vscode.window.showInformationMessage("Open the selected file in a workspace before asking opencode to explain it.")
      return
    }

    const selection = activeEditor.selection
    const prompt = buildExplanationPrompt({
      relativePath: vscode.workspace.asRelativePath(document.uri),
      languageId: document.languageId,
      text: document.getText(selection),
      startLine: selection.start.line,
      endLine: selection.end.line,
      endCharacter: selection.end.character,
    })

    await openTerminal({ prompt, submit: true, agent: "plan", reuse: true }).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      await vscode.window.showErrorMessage(`Unable to explain the selected code: ${message}`)
    })
  })

  const toggleLearnModePreviewDisposable = vscode.commands.registerCommand(
    "opencode.toggleLearnModePreview",
    async () => {
      learnModePreview = !learnModePreview
      await context.workspaceState.update(LEARN_MODE_PREVIEW_KEY, learnModePreview)
      await vscode.commands.executeCommand("setContext", LEARN_MODE_PREVIEW_KEY, learnModePreview)
      await vscode.window.showInformationMessage(
        `OpenCode Learn Mode Preview ${learnModePreview ? "enabled" : "disabled"}.`,
      )
    },
  )

  context.subscriptions.push(
    openNewTerminalDisposable,
    openTerminalDisposable,
    addFilepathDisposable,
    explainSelectionDisposable,
    toggleLearnModePreviewDisposable,
  )

  async function openTerminal(input?: {
    prompt: string
    submit?: boolean
    agent?: "build" | "plan"
    reuse?: boolean
  }) {
    const terminalName = input?.reuse ? LEARN_TERMINAL_NAME : TERMINAL_NAME
    const reusable = input?.reuse
      ? vscode.window.terminals
          .filter((terminal) => terminal.name === terminalName)
          .map((terminal) => ({ terminal, port: terminalPort(terminal) }))
          .find((item): item is { terminal: vscode.Terminal; port: number } => item.port !== undefined)
      : undefined
    const port = reusable?.port ?? Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384
    const terminal =
      reusable?.terminal ??
      vscode.window.createTerminal({
        name: terminalName,
        iconPath: {
          light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
          dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
        },
        location: {
          viewColumn: vscode.ViewColumn.Beside,
          preserveFocus: false,
        },
        env: {
          _EXTENSION_OPENCODE_PORT: port.toString(),
          OPENCODE_CALLER: "vscode",
        },
      })

    terminal.show()
    if (!reusable) {
      const agentFlag = input?.agent ? ` --agent ${input.agent}` : ""
      terminal.sendText(`opencode --port ${port}${agentFlag}`)
    }

    const initialPrompt = input?.prompt ?? getActiveFile()
    if (!initialPrompt) {
      return
    }

    // The CLI can take several seconds to start, especially in a dev container.
    let tries = SERVER_READY_RETRIES
    let connected = false
    do {
      await new Promise((resolve) => setTimeout(resolve, SERVER_READY_DELAY_MS))
      try {
        const response = await fetch(`http://localhost:${port}/app`)
        if (response.ok) {
          connected = true
          break
        }
      } catch {}

      tries--
    } while (tries > 0)

    // If connected, append the prompt to the terminal
    if (connected) {
      // Give the TUI time to subscribe to server events after the HTTP server starts.
      await new Promise((resolve) => setTimeout(resolve, TUI_READY_DELAY_MS))
      await appendPrompt(port, input?.prompt ?? `In ${initialPrompt}`)
      if (input?.submit) {
        await submitPrompt(port)
      }
      terminal.show()
      return
    }

    await vscode.window.showErrorMessage(
      "opencode did not become ready within 15 seconds. Close the terminal and try Explain Selected Code again.",
    )
  }

  function terminalPort(terminal: vscode.Terminal) {
    // VS Code exposes env only for terminals created with TerminalOptions.
    if (!("env" in terminal.creationOptions)) {
      return
    }
    const value = terminal.creationOptions.env?.["_EXTENSION_OPENCODE_PORT"]
    if (typeof value !== "string") {
      return
    }
    const port = Number.parseInt(value, 10)
    if (!Number.isInteger(port)) {
      return
    }
    return port
  }

  async function appendPrompt(port: number, text: string) {
    const response = await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      throw new Error(`Failed to append the opencode prompt (${response.status}).`)
    }
  }

  async function submitPrompt(port: number) {
    const response = await fetch(`http://localhost:${port}/tui/submit-prompt`, { method: "POST" })
    if (!response.ok) {
      throw new Error(`Failed to submit the opencode prompt (${response.status}).`)
    }
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
      return
    }

    const document = activeEditor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      return
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri)
    let filepathWithAt = `@${relativePath}`

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1
      const endLine = selection.end.line + 1

      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`
      }
    }

    return filepathWithAt
  }
}
