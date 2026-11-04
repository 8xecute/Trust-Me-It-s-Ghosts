import { io } from 'socket.io-client';

export function connectServer(onConnectionChange: (connected: boolean) => void) {
  const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001');
  socket.on('connect', () => onConnectionChange(true));
  socket.on('disconnect', () => onConnectionChange(false));
  socket.on('connect_error', () => onConnectionChange(false));
  return socket;
}
