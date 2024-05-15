const WebSocket = require("ws");
const { devlog } = require("./helpers");
const { format } = require("crypto-js");

const WS_STATUS = {
  MESSAGE_TRANSFER: 1,
  GROUP_MESSAGE_TRANSFER: 2,
  CHECK_ONLINE: 3,
  PACKET_DISCONNECT: 4,
  COMMENT_TRANSFER: 5,
  MUTED: 6,
  UNMUTED: 7
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
      console.log(parsedMessage);
      if (parsedMessage.type === WS_STATUS.MESSAGE_TRANSFER) {
        this.wss.clients.forEach(function each(client) {
          if (
            client.id === parsedMessage.data.receiver.id &&
            client.readyState === WebSocket.OPEN
          ) {
            devlog(`Client with id ${ws.id} received message`);
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
              },
            };
            client.send(JSON.stringify(formattedMessage));
          }
        });
      } else if (parsedMessage.type === WS_STATUS.GROUP_MESSAGE_TRANSFER) {
        const formattedMessage = {
          type: WS_STATUS.GROUP_MESSAGE_TRANSFER,
          data: {
            id: parsedMessage.data.id,
            sender: {
              ...parsedMessage.data.sender,
              id: parsedMessage.data.sender.user_id,
            },
            receiver: null,
            message: parsedMessage.data.message,
            sentAt: parsedMessage.data.sentAt,
          },
        };
        this.wss.clients.forEach(function each(client) {
          parsedMessage.receivers.some((receiver) => {
            if (
              receiver.userId === client.id &&
              receiver.userId != formattedMessage.data.sender.id
            ) {
              client.send(JSON.stringify(formattedMessage));
            }
          });
        });
      } else if (parsedMessage.type === WS_STATUS.CHECK_ONLINE) {
        const senderId = parsedMessage.data.sender;
        const friends = JSON.parse(parsedMessage.data.friends);

        const updatedFriends = friends.map((friend) => {
          const isOnline = Array.from(this.wss.clients).some(
            (client) =>
              client.id === friend.id && client.readyState === WebSocket.OPEN
          );
          return { ...friend, online: isOnline };
        });

        const response = {
          type: WS_STATUS.CHECK_ONLINE,
          data: {
            sender: senderId,
            friends: updatedFriends,
          },
        };

        this.wss.clients.forEach(function each(client) {
          if (
            client.id === parsedMessage.data.sender &&
            client.readyState === WebSocket.OPEN
          ) {
            client.send(JSON.stringify(response));
          }
        });
      } else if (parsedMessage.type === WS_STATUS.PACKET_DISCONNECT) {
        const message = {
          type: WS_STATUS.PACKET_DISCONNECT,
          senderID: senderId,
        };

        parsedMessage.data.friends.forEach((friend) => {
          this.wss.clients.forEach((client) => {
            if (
              client.userId === friend.id &&
              client.readyState === WebSocket.OPEN
            ) {
              client.send(JSON.stringify(message));
              console.log(friend.id);
            }
          });
        });
      } else if (parsedMessage.type === WS_STATUS.COMMENT_TRANSFER) {
        this.wss.clients.forEach((client) => {
          client.send(JSON.stringify(parsedMessage));
        });
      } else if (parsedMessage.type === WS_STATUS.MUTED) {
        this.wss.clients.forEach((client) => {
          if (
            client.id === parsedMessage.receiverId &&
            client.readyState === WebSocket.OPEN
          ) {
            console.log("Muting", parsedMessage.receiverId)
            client.send(JSON.stringify(parsedMessage));
          }
        });
      } else if (parsedMessage.type === WS_STATUS.UNMUTED) {
        this.wss.clients.forEach((client) => {
          if (
            client.id === parsedMessage.receiverId &&
            client.readyState === WebSocket.OPEN
          ) {
            console.log("Muting", parsedMessage.receiverId)
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
