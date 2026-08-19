// Protocolo de sinalização compartilhado entre servidor e frontend.
// Mantenha este arquivo em sincronia com frontend/services/signaling.ts

export interface ParticipantInfo {
  id: string;
  name: string;
  micEnabled: boolean;
  sharing: boolean;
}

export type ClientMessage =
  | { type: "create-room"; name: string }
  | { type: "join-room"; roomCode: string; name: string }
  | { type: "leave-room" }
  | {
      type: "signal";
      to: string;
      kind: "offer" | "answer" | "ice-candidate";
      data: unknown;
    }
  | { type: "mic-state"; enabled: boolean }
  | { type: "screen-state"; sharing: boolean }
  | { type: "ping" };

export type ServerMessage =
  | { type: "room-created"; roomCode: string; selfId: string }
  | {
      type: "room-joined";
      roomCode: string;
      selfId: string;
      participants: ParticipantInfo[];
    }
  | { type: "peer-joined"; peer: ParticipantInfo }
  | { type: "peer-left"; peerId: string }
  | {
      type: "signal";
      from: string;
      kind: "offer" | "answer" | "ice-candidate";
      data: unknown;
    }
  | { type: "peer-mic-state"; peerId: string; enabled: boolean }
  | { type: "peer-screen-state"; peerId: string; sharing: boolean }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong" };

export type ErrorCode =
  | "INVALID_NAME"
  | "INVALID_CODE"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "NOT_IN_ROOM"
  | "SERVER_ERROR";
