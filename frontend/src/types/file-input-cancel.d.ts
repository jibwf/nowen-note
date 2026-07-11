export {};

declare global {
  interface HTMLInputElement {
    /** Supported by modern mobile file pickers; absent from older TypeScript DOM declarations. */
    oncancel: ((this: HTMLInputElement, event: Event) => unknown) | null;
  }
}
