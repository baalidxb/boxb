export const IPC = Object.freeze({
  app: {
    version: 'app:version'
  },
  storage: {
    get: 'storage:get',
    set: 'storage:set',
    delete: 'storage:delete',
    getAll: 'storage:get-all',
    clear: 'storage:clear'
  }
});

export type IpcChannel = string;
