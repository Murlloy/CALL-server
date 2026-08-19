import http from "http";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage, ErrorCode } from "./types";
import {
  MAX_PARTICIPANTS,
  MAX_NAME_LENGTH,
  type Client,
  createRoomCode,
  isValidRoomCode,
  isValidName,
  toParticipantInfo,
  createRoom,
  getRoom,
  roomExists,
  roomParticipantCount,
  addClientToRoom,
  getOtherParticipants,
  removeClientFromRoom,
} from "./rooms";

const PORT = Number(process.env.PORT) || 8080;

const server = http.createServer((req, res) => {
  // Endpoint simples de healthcheck, útil para o provedor de hospedagem
  // (Railway/Render/Fly) verificar se o processo está no ar.
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Servidor de sinalização do CALL está no ar.");
});

const wss = new WebSocketServer({ server });

const clients = new Map<string, Client>();

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
  send(ws, { type: "error", code, message });
}

function broadcastToRoom(roomCode: string, message: ServerMessage, exceptId?: string): void {
  const others = getOtherParticipants(roomCode, exceptId ?? "");
  for (const client of others) {
    send(client.ws, message);
  }
}

function handleLeave(client: Client): void {
  if (!client.roomCode) return;
  const roomCode = client.roomCode;
  removeClientFromRoom(roomCode, client.id);
  broadcastToRoom(roomCode, { type: "peer-left", peerId: client.id });
  client.roomCode = null;
}

wss.on("connection", (ws: WebSocket) => {
  const id = crypto.randomUUID();
  const client: Client = {
    id,
    ws,
    name: "",
    roomCode: null,
    micEnabled: true,
    sharing: false,
  };
  clients.set(id, client);

  ws.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      sendError(ws, "SERVER_ERROR", "Mensagem inválida.");
      return;
    }

    switch (message.type) {
      case "create-room": {
        const name = message.name?.trim().slice(0, MAX_NAME_LENGTH) ?? "";
        if (!isValidName(name)) {
          sendError(ws, "INVALID_NAME", "Informe um nome válido.");
          return;
        }
        client.name = name;
        const roomCode = createRoomCode();
        createRoom(roomCode, client);
        client.roomCode = roomCode;
        send(ws, { type: "room-created", roomCode, selfId: client.id });
        break;
      }

      case "join-room": {
        const name = message.name?.trim().slice(0, MAX_NAME_LENGTH) ?? "";
        const roomCode = (message.roomCode ?? "").trim().toUpperCase();

        if (!isValidName(name)) {
          sendError(ws, "INVALID_NAME", "Informe um nome válido.");
          return;
        }
        if (!isValidRoomCode(roomCode)) {
          sendError(ws, "INVALID_CODE", "Código de sala inválido.");
          return;
        }
        if (!roomExists(roomCode)) {
          sendError(ws, "ROOM_NOT_FOUND", "Essa sala não existe ou já foi encerrada.");
          return;
        }
        if (roomParticipantCount(roomCode) >= MAX_PARTICIPANTS) {
          sendError(ws, "ROOM_FULL", "Essa sala já está cheia.");
          return;
        }

        client.name = name;
        const existingParticipants = getOtherParticipants(roomCode, client.id).map(
          toParticipantInfo
        );
        addClientToRoom(roomCode, client);
        client.roomCode = roomCode;

        send(ws, {
          type: "room-joined",
          roomCode,
          selfId: client.id,
          participants: existingParticipants,
        });
        broadcastToRoom(roomCode, { type: "peer-joined", peer: toParticipantInfo(client) }, client.id);
        break;
      }

      case "leave-room": {
        handleLeave(client);
        break;
      }

      case "signal": {
        if (!client.roomCode) {
          sendError(ws, "NOT_IN_ROOM", "Você não está em uma sala.");
          return;
        }
        const room = getRoom(client.roomCode);
        const target = room?.clients.get(message.to);
        if (!target) return;
        send(target.ws, {
          type: "signal",
          from: client.id,
          kind: message.kind,
          data: message.data,
        });
        break;
      }

      case "mic-state": {
        client.micEnabled = message.enabled;
        if (client.roomCode) {
          broadcastToRoom(
            client.roomCode,
            { type: "peer-mic-state", peerId: client.id, enabled: message.enabled },
            client.id
          );
        }
        break;
      }

      case "screen-state": {
        client.sharing = message.sharing;
        if (client.roomCode) {
          broadcastToRoom(
            client.roomCode,
            { type: "peer-screen-state", peerId: client.id, sharing: message.sharing },
            client.id
          );
        }
        break;
      }

      case "ping": {
        send(ws, { type: "pong" });
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    handleLeave(client);
    clients.delete(id);
  });

  ws.on("error", () => {
    handleLeave(client);
    clients.delete(id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de sinalização do CALL rodando na porta ${PORT}`);
});
