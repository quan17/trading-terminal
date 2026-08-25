import type { WebSocket } from "ws";
import type { Market, WsServerEvent } from "@reya/shared";

export class RealtimeHub {
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly getMarkets: () => Market[]) {}

  addClient(socket: WebSocket) {
    this.clients.add(socket);
    this.send(socket, {
      type: "system.ready",
      timestamp: Date.now(),
      markets: this.getMarkets()
    });

    socket.on("close", () => {
      this.clients.delete(socket);
    });
  }

  broadcast(event: WsServerEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  send(socket: WebSocket, event: WsServerEvent) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }
}
