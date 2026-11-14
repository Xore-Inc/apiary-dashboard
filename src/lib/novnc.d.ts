// @novnc/novnc ships no TypeScript declarations. Only what the sandbox live
// view uses (see node_modules/@novnc/novnc/core/rfb.js for the whole API).
declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: { shared?: boolean; credentials?: Record<string, string> })
    viewOnly: boolean
    scaleViewport: boolean
    resizeSession: boolean
    focusOnClick: boolean
    background: string
    disconnect(): void
  }
}
