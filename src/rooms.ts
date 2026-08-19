import type WebSocket from "ws";
import type { ParticipantInfo } from "./types";

export const MAX_PARTICIPANTS = 8;
export const MAX_NAME_LENGTH = 24;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I para evitar confusão
const ROOM_CODE_LENGTH = 6;
const EMPTY_ROOM_TTL_MS = 30_000; // tempo até remover sala vazia da memória

export interface Client {
  id: string;
  ws: WebSocket;
  name: string;
  roomCode: string | null;
  micEnabled: boolean;
  sharing: boolean;
}

interface Room {
  code: string;
  clients: Map<string, Client>;
  emptyTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function createRoomCode(): string {
  let code = generateRoomCode();
  // Evita colisão com salas já ativas.
  while (rooms.has(code)) {
    code = generateRoomCode();
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;
}

export function toParticipantInfo(client: Client): ParticipantInfo {
  return {
    id: client.id,
    name: client.name,
    micEnabled: client.micEnabled,
    sharing: client.sharing,
  };
}

export function createRoom(code: string, firstClient: Client): void {
  const room: Room = { code, clients: new Map(), emptyTimer: null };
  room.clients.set(firstClient.id, firstClient);
  rooms.set(code, room);
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function roomExists(code: string): boolean {
  return rooms.has(code);
}

export function roomParticipantCount(code: string): number {
  return rooms.get(code)?.clients.size ?? 0;
}

export function addClientToRoom(code: string, client: Client): void {
  const room = rooms.get(code);
  if (!room) return;
  if (room.emptyTimer) {
    clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
  }
  room.clients.set(client.id, client);
}

export function getOtherParticipants(code: string, exceptId: string): Client[] {
  const room = rooms.get(code);
  if (!room) return [];
  return [...room.clients.values()].filter((c) => c.id !== exceptId);
}

export function removeClientFromRoom(code: string, clientId: string): void {
  const room = rooms.get(code);
  if (!room) return;
  room.clients.delete(clientId);

  if (room.clients.size === 0) {
    // Sala fica um tempo em memória antes de ser descartada, evitando
    // remoções acidentais em reconexões rápidas.
    room.emptyTimer = setTimeout(() => {
      const current = rooms.get(code);
      if (current && current.clients.size === 0) {
        rooms.delete(code);
      }
    }, EMPTY_ROOM_TTL_MS);
  }
}
