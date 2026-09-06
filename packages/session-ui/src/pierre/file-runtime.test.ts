import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

import { createReadyWatcher, notifyShadowReady } from "./file-runtime"

beforeAll(() => {
  GlobalRegistrator.register()

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0)
    return 1
  }) as typeof requestAnimationFrame
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

describe("notifyShadowReady", () => {
  test("calls onReady when the shadow root already exists and is ready", () => {
    const state = createReadyWatcher()
    const container = document.createElement("div")
    const host = document.createElement("div")
    const root = host.attachShadow({ mode: "open" })

    let readyCalled = false

    notifyShadowReady({
      state,
      container,
      getRoot: () => root,
      isReady: () => true,
      onReady: () => {
        readyCalled = true
      },
    })

    expect(readyCalled).toBe(true)
  })

  test("waits until an existing shadow root becomes ready", async () => {
    const state = createReadyWatcher()
    const container = document.createElement("div")
    const host = document.createElement("div")
    const root = host.attachShadow({ mode: "open" })

    let ready = false
    let readyCalled = false

    notifyShadowReady({
      state,
      container,
      getRoot: () => root,
      isReady: () => ready,
      onReady: () => {
        readyCalled = true
      },
    })

    expect(readyCalled).toBe(false)

    ready = true
    root.appendChild(document.createElement("span"))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(readyCalled).toBe(true)
  })

  test("waits for the shadow root to become available", async () => {
    const state = createReadyWatcher()
    const container = document.createElement("div")

    let root: ShadowRoot | undefined
    let readyCalled = false

    notifyShadowReady({
      state,
      container,
      getRoot: () => root,
      isReady: () => true,
      onReady: () => {
        readyCalled = true
      },
    })

    expect(readyCalled).toBe(false)

    const host = document.createElement("div")
    root = host.attachShadow({ mode: "open" })

    container.appendChild(host)

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(readyCalled).toBe(true)
  })

  test("does not call onReady for an outdated watcher", () => {
    const state = createReadyWatcher()
    const container = document.createElement("div")
    const host = document.createElement("div")
    const root = host.attachShadow({ mode: "open" })

    const callbacks: FrameRequestCallback[] = []

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callbacks.push(callback)
      return callbacks.length
    }) as typeof requestAnimationFrame

    let firstReadyCalled = false
    let secondReadyCalled = false

    notifyShadowReady({
      state,
      container,
      getRoot: () => root,
      isReady: () => true,
      onReady: () => {
        firstReadyCalled = true
      },
      settleFrames: 1,
    })

    notifyShadowReady({
      state,
      container,
      getRoot: () => root,
      isReady: () => true,
      onReady: () => {
        secondReadyCalled = true
      },
    })

    while (callbacks.length > 0) {
      callbacks.shift()?.(0)
    }

    expect(firstReadyCalled).toBe(false)
    expect(secondReadyCalled).toBe(true)
  })
})