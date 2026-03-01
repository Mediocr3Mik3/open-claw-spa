declare module "ws" {
  class WebSocket {
    constructor(url: string, protocols?: string | string[]);
    onopen: (() => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: (() => void) | null;
    onerror: (() => void) | null;
    close(): void;
    send(data: string | Buffer): void;
    readonly readyState: number;
  }
  export default WebSocket;
}
