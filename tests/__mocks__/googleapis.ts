// Jest module mock for googleapis — provides mock YouTube API client functions
// that tests can control via the exported _mocks object.

export const _mocks = {
  liveBroadcastsList: jest.fn(),
  liveChatMessagesList: jest.fn(),
  liveChatMessagesInsert: jest.fn(),
  liveChatMessagesDelete: jest.fn(),
  liveChatBansInsert: jest.fn(),
  oauth2SetCredentials: jest.fn()
}

const mockYoutubeClient = {
  liveBroadcasts: { list: _mocks.liveBroadcastsList },
  liveChatMessages: {
    list: _mocks.liveChatMessagesList,
    insert: _mocks.liveChatMessagesInsert,
    delete: _mocks.liveChatMessagesDelete
  },
  liveChatBans: { insert: _mocks.liveChatBansInsert }
}

export const google = {
  auth: {
    OAuth2: jest.fn().mockImplementation(() => ({
      setCredentials: _mocks.oauth2SetCredentials
    }))
  },
  youtube: jest.fn().mockReturnValue(mockYoutubeClient)
}
