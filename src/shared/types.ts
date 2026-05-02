export interface AppDefinition {
  id: string;
  name: string;
  url: string;
  icon: string;
}

export interface Account {
  id: string;
  appId: string;
  label: string;
}

export interface Workspace {
  id: string;
  name: string;
  icon: string;
  order: number;
  createdAt: number;
}

// Per-window terminal tab. Each tab owns one pty in the main process,
// addressed by ptyId. Tabs are NOT persisted across launches — the open/
// closed state of the panel is, but tab content is rebuilt fresh every
// session (PowerShell handles its own command history).
export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  ptyId: string;
  createdAt: number;
}
