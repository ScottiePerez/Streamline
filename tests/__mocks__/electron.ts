const ipcRenderer = {
  on: jest.fn(),
  once: jest.fn(),
  send: jest.fn(),
  invoke: jest.fn(),
  removeListener: jest.fn()
}

const ipcMain = {
  on: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn()
}

const app = {
  getPath: jest.fn(() => ':memory:'),
  on: jest.fn(),
  quit: jest.fn()
}

const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  webContents: { send: jest.fn() },
  on: jest.fn()
}))

export { ipcRenderer, ipcMain, app, BrowserWindow }
