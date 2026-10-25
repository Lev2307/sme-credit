// Access-токен живёт только в памяти вкладки (docs/04-architecture.md, «Безопасность»).
// Refresh-токен лежит в httpOnly-cookie, скрипты до него не достают.
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
