import { io, Socket } from 'socket.io-client';

export const SOCKET_URL = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function connectSocket(token: string): void {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

export function onSocketEvent(event: string, handler: (...args: unknown[]) => void): void {
  getSocket().on(event, handler);
}

export function offSocketEvent(event: string, handler: (...args: unknown[]) => void): void {
  getSocket().off(event, handler);
}
