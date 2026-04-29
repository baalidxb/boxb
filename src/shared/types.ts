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
