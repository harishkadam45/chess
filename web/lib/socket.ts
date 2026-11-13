"use client";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

let socket: Socket | null = null;

/** Shared authenticated socket (session cookie is sent with the handshake). */
export function getSocket(): Socket {
  if (!socket) socket = io(API_URL, { withCredentials: true, autoConnect: false });
  if (!socket.connected && !socket.active) socket.connect();
  return socket;
}

export function emitAck<T = Record<string, unknown>>(event: string, payload: object = {}): Promise<T & { error?: string }> {
  return new Promise((resolve) => getSocket().timeout(8000).emit(event, payload, (err: unknown, res: T) => {
    resolve(err ? ({ error: "Request timed out" } as T & { error: string }) : (res as T & { error?: string }));
  }));
}
