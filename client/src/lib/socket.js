import { io } from 'socket.io-client';

export const socket = io({
  path: '/api/socket.io',
  withCredentials: true,
  autoConnect: false
});
