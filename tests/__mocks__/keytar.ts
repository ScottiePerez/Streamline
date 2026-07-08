const store = new Map<string, string>()

const keytar = {
  getPassword: jest.fn(async (_service: string, account: string) =>
    store.get(account) ?? null
  ),
  setPassword: jest.fn(async (_service: string, account: string, password: string) => {
    store.set(account, password)
  }),
  deletePassword: jest.fn(async (_service: string, account: string) => {
    store.delete(account)
    return true
  }),
  _reset() { store.clear() }
}

export default keytar
export const { getPassword, setPassword, deletePassword } = keytar
