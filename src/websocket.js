const WebSocket = require("ws");
const { devlog } = require("./helpers");
const { format } = require("crypto-js");

const WS_STATUS = {
  MESSAGE_TRANSFER: 1,
  REQUEST_TO_SEND_PUBLIC_KEY: 2,
  ACCEPTED_REQUEST_FOR_PUBLIC_KEY: 3,
  REQUEST_TO_DELETE_PUBLIC_KEY: 4,
};

class WebSocketServer {
  constructor(port) {
    this.port = port;
    this.wss = new WebSocket.Server({ port: this.port });
    this.wss.on("connection", this.handleConnection.bind(this));
  }

  handleConnection(ws, req) {
    ws.id = parseInt(req.url.split("=")[1]);
    ws.on("message", this.handleMessage.bind(this, ws));
  }

  handleMessage(ws, message) {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === WS_STATUS.MESSAGE_TRANSFER) {
        this.wss.clients.forEach(function each(client) {
          if (
            client.id === parsedMessage.data.receiver.id &&
            client.readyState === WebSocket.OPEN
          ) {
            devlog(`Client with id ${ws.id} received message`);

            devlog(parsedMessage);
            const formattedMessage = {
              type: WS_STATUS.MESSAGE_TRANSFER,
              data: {
                id: parsedMessage.data.id,
                sender: {
                  ...parsedMessage.data.sender,
                  id: parsedMessage.data.sender.user_id,
                },
                receiver: {
                  ...parsedMessage.data.receiver,
                  id: parsedMessage.data.receiver.user_id,
                },
                message: parsedMessage.data.message,
                sentAt: parsedMessage.data.sentAt,
                hmac: parsedMessage.data.hmac,
                hmacKey: parsedMessage.data.hmacKey,
              },
            };
            client.send(JSON.stringify(formattedMessage));
          }
        });
      } else {
        if (parsedMessage.type === WS_STATUS.REQUEST_TO_SEND_PUBLIC_KEY) {
          devlog(
            `${parsedMessage.data.senderID} has sent a request for ${parsedMessage.data.receiverID}'s public key.`
          );
        } else if (
          parsedMessage.type === WS_STATUS.ACCEPTED_REQUEST_FOR_PUBLIC_KEY
        ) {
          devlog(
            `${parsedMessage.data.senderID} accepted request from ${parsedMessage.data.receiverID} to share public keys`
          );
        } else if (
          parsedMessage.type === WS_STATUS.REQUEST_TO_DELETE_PUBLIC_KEY
        ) {
          devlog(
            `${parsedMessage.data.senderID} asked ${parsedMessage.data.receiverID} to delete their public key record`
          );
        }
        this.wss.clients.forEach(function each(client) {
          if (
            client.id === parsedMessage.data.receiverID &&
            client.readyState === WebSocket.OPEN
          ) {
            client.send(JSON.stringify(parsedMessage));
          }
        });
      }
    } catch (error) {
      console.error("Error receiving message in web socket:", error);
    }
  }
}

module.exports = WebSocketServer;
