const DEFAULT_WS_URL = "ws://localhost:1234";

declare const process: {
  readonly env: {
    readonly MERMOLLUSC_PLAYWRIGHT_WS_URL: string | undefined;
  };
};

const wsUrl = (): string => process.env["MERMOLLUSC_PLAYWRIGHT_WS_URL"] ?? DEFAULT_WS_URL;

export const collabUrl = (room: string): string =>
  `/?collab&room=${encodeURIComponent(room)}&ws=${encodeURIComponent(wsUrl())}`;
