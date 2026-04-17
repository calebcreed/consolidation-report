/**
 * WebSocket Management - handles client connections and broadcasting
 */

import { WebSocket } from 'ws';
import { ServerState } from './state-types';

export class WebSocketManager {
  private clients = new Set<WebSocket>();

  addClient(ws: WebSocket, initialState: ServerState): void {
    console.log('Client connected');
    this.clients.add(ws);

    // Send current state
    ws.send(JSON.stringify({
      type: 'init',
      data: initialState,
    }));

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log('Client disconnected');
    });
  }

  broadcast(message: { type: string; data: any }): void {
    const json = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }

  output(line: string): void {
    this.broadcast({ type: 'output', data: line });
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
