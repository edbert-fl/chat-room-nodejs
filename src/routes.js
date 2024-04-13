const { PrismaClient } = require("@prisma/client");
const { devlog } = require("./helpers");
const CryptoJS = require("crypto-js");
const WebSocket = require("ws");
const jwt = require('jsonwebtoken');
const authMiddleware = require("./authMiddleware");
const validator = require('validator');

module.exports.initializeRoutes = (app) => {
  const prisma = new PrismaClient();

  // WebSocket server
  const wss = new WebSocket.Server({ port: process.env.WEBSOCKET_PORT });

  // Handle WebSocket connections
  wss.on("connection", function connection(ws, req) {
    ws.id = parseInt(req.url.split("=")[1]);
    ws.on("message", function incoming(message) {
      const messageString = message.toString();
      const parsedMessage = JSON.parse(messageString);

      devlog(`Client with id ${ws.id} recevied message`);
      wss.clients.forEach(function each(client) {
        if (
          client.id === parsedMessage.receiver.id &&
          client.readyState === WebSocket.OPEN
        ) {
          const formattedMessage = {
            id: parsedMessage.id,
            sender: {
              ...parsedMessage.sender,
              id: parsedMessage.sender.user_id,
            },
            receiver: {
              ...parsedMessage.receiver,
              id: parsedMessage.receiver.user_id,
            },
            message: parsedMessage.message,
            sentAt: parsedMessage.sent_at,
          };
          client.send(JSON.stringify(formattedMessage));
        }
      });
    });
  });

  app.get("/api", function (req, res, next) {
    res.json({ msg: "This is CORS-enabled for all origins!" });
  });

  /* 
  Login to a user account
  */
  app.post("/user/login", async function (req, res) {
    const { username, password } = req.body;
    const validatedUsername = validator.escape(username)
    const validatedPassword = validator.escape(password)

    try {
      devlog(`Logging into ${validatedUsername}'s account`);

      // Retrieve user by username
      const user = await prisma.user.findUnique({
        where: {
          username: validatedUsername,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Compare hashed password with input password
      const hashedInputPassword = CryptoJS.SHA256(validatedPassword + user.salt);
      const hashedPasswordString = hashedInputPassword.toString(
        CryptoJS.enc.Base64
      );
      if (hashedPasswordString !== user.hashed_password) {
        devlog(`Invalid password`);
        return res.status(401).json({ error: "Invalid password" });
      }

      devlog(`Authentication successful!`);
      const responseData = {
        id: user.user_id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
      };

      const jwtToken = jwt.sign(
        {
          id: user.user_id,
          email: user.email,
          iat: Math.floor(Date.now() / 1000),
        },
        process.env.SECRET,
        { expiresIn: "1h" }
      );

      res.status(200).json({
        user: responseData,
        message: "Authentication successful!",
        token: jwtToken,
      });
    } catch (error) {
      console.error("Error during login", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  });

  /* 
  Register a new user
  */
  app.post("/user/register", async function (req, res) {
    const { username, email, salt, hashedPassword } = req.body;
    const validatedUsername = validator.escape(username);
    const validatedEmail = validator.escape(email);

    if (!validator.isEmail(validatedEmail)) {
      res.status(400).json({ success: false, error: 'Invalid email address' });
    } 

    try {
      devlog(`Registering new account`);

      // Check if username or email already in use
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username: validatedUsername }, { email: validatedEmail }],
        },
      });

      if (existingUser) {
        devlog(`User already exists`);
        return res.status(400).json({ error: "User already exists" });
      }

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          username: validatedUsername,
          email: validatedEmail,
          hashed_password: hashedPassword,
          salt: salt,
        },
      });

      devlog(`User added successfully, returning result.`);
      const responseData = {
        id: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.created_at,
      };

      const jwtToken = jwt.sign(
        {
          id: newUser.user_id,
          email: newUser.email,
          iat: Math.floor(Date.now() / 1000),
        },
        process.env.SECRET,
        { expiresIn: "1h" }
      );

      res.status(200).json({
        user: responseData,
        message: "User added successfully!",
        token: jwtToken,
      });
    } catch (error) {
      devlog(`ERROR\t${error.message}`);
      res
        .status(500)
        .json({ message: "Internal Server Error", details: error.message });
    }
  });

  /* 
  Get all of a user's friends
  */
  app.post("/user/get/friends", authMiddleware, async function (req, res) {
    const { userId } = req.body;

    try {
      // Get all friends of the user from the friends table
      const friends = await prisma.friend.findMany({
        where: {
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        include: {
          user1: true, // Include details of user1
          user2: true, // Include details of user2
        },
      });

      res.json({ success: true, friends });
    } catch (error) {
      console.error("Error fetching user's friends:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to fetch user's friends" });
    }
  });

  /* 
  Get all of a user's friend requests
  */
  app.post("/user/get/friend-requests", authMiddleware, async function (req, res) {
    const { userID } = req.body;

    try {
      const friendRequests = await prisma.friendRequest.findMany({
        where: { receiver_id: userID },
        include: {
          sender: true,
        },
      });

      devlog(friendRequests);

      const formattedFriendRequests = friendRequests.map((friendRequest) => ({
        id: friendRequest.id,
        sender: { ...friendRequest.sender, id: friendRequest.sender_id },
        receiverID: friendRequest.receiver_id,
        accepted: friendRequest.accepted,
        createdAt: friendRequest.created_at,
      }));

      devlog(formattedFriendRequests);

      res.json({ success: true, friendRequests: formattedFriendRequests });
    } catch (error) {
      console.error("Error fetching user's friend requests:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch user's friend requests",
      });
    }
  });

  /* 
  Send a friend request
  */
  app.post("/friend/add", authMiddleware, async function (req, res) {
    const { sender_id, friend_name } = req.body;
    const validatedFriend = validator.escape(friend_name);

    try {
      const sender = await prisma.user.findUnique({
        where: { user_id: sender_id },
      });

      if (!sender) {
        return res
          .status(404)
          .json({ success: false, error: "Request sent from invalid account." });
      }

      const receiver = await prisma.user.findUnique({
        where: { username: validatedFriend },
      });

      if (!receiver) {
        return res
          .status(404)
          .json({ success: false, error: "User not found." });
      }

      // Create the friend request
      await prisma.friendRequest.create({
        data: {
          sender_id: sender.user_id,
          receiver_id: receiver.user_id,
        },
      });

      res
        .status(200)
        .json({ success: true, message: "Friend request sent successfully." });
    } catch (error) {
      console.error("Error sending friend request:", error);
      res
        .status(500)
        .json({ success: false, error: "Error sending friend request." });
    }
  });

  /* 
  Accept a friend request
  */
  app.post("/friend/accept", authMiddleware, async function (req, res) {
    const { request_id } = req.body;

    try {
      // Find the friend request
      const friendRequest = await prisma.friendRequest.findUnique({
        where: { id: request_id },
      });

      if (!friendRequest) {
        return res
          .status(404)
          .json({ success: false, error: "Friend request not found." });
      }

      // Delete the friend request, since it has been accepted
      await prisma.friendRequest.delete({
        where: { id: friendRequest.id },
      });

      const friendRequest2 = await prisma.friendRequest.findUnique({
        where: { id: request_id },
      });

      // Create a new friend relationship
      await prisma.friend.create({
        data: {
          user1Id: friendRequest.sender_id,
          user2Id: friendRequest.receiver_id,
        },
      });

      const friends = await prisma.friendRequest.findMany({
        where: { id: request_id },
      });

      res.status(200).json({
        success: true,
        message: "Friend request accepted successfully.",
      });
    } catch (error) {
      console.error("Error accepting friend request:", error);
      res
        .status(500)
        .json({ success: false, error: "Error accepting friend request." });
    }
  });

  /* 
  Reject a friend request
  */
  app.post("/friend/reject", authMiddleware, async function (req, res) {
    const { request_id } = req.body;

    try {
      // Find the friend request
      const friendRequest = await prisma.friendRequest.findUnique({
        where: { id: request_id },
      });

      if (!friendRequest) {
        return res
          .status(404)
          .json({ success: false, error: "Friend request not found." });
      }

      // Delete the friend request
      await prisma.friendRequest.delete({
        where: { id: request_id },
      });

      res.status(200).json({
        success: true,
        message: "Friend request rejected.",
      });
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      res
        .status(500)
        .json({ success: false, error: "Error rejecting friend request." });
    }
  });

  /* 
  Send a message
  */
  app.post("/message/send", authMiddleware, async function (req, res) {
    const { sender_id, receiver_id, message } = req.body;

    try {
      // Save message to the database
      const savedMessage = await prisma.message.create({
        data: {
          sender_id,
          receiver_id,
          message,
        },
        include: {
          sender: true,
          receiver: true,
        },
      });

      const transformedMessage = {
        ...savedMessage,
        sender: {
          ...savedMessage.sender,
          id: savedMessage.sender.user_id,
        },
        receiver: {
          ...savedMessage.receiver,
          id: savedMessage.receiver.user_id,
        },
        sentAt: savedMessage.sent_at,
      };

      res.status(200).json({ success: true, message: transformedMessage });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ success: false, error: "Error sending message." });
    }
  });

  /* 
  Get messages
  */
  app.post("/message/get", authMiddleware, async function (req, res) {
    const { user_id, friend_id } = req.body;
    try {
      const messages = await prisma.message.findMany({
        where: {
          OR: [
            {
              sender_id: user_id,
              receiver_id: friend_id,
            },
            {
              sender_id: friend_id,
              receiver_id: user_id,
            },
          ],
        },
        include: {
          sender: true,
          receiver: true,
        },
        orderBy: {
          sent_at: "asc",
        },
      });

      const formattedMessages = messages.map((message) => ({
        id: message.id,
        sender: { ...message.sender, id: message.sender.user_id },
        receiver: { ...message.receiver, id: message.receiver.user_id },
        message: message.message,
        sentAt: message.sent_at,
      }));

      res.status(200).json({ success: true, messages: formattedMessages });
    } catch (error) {
      console.error("Error getting messages:", error);
      res
        .status(500)
        .json({ success: false, error: "Error getting messages." });
    }
  });
};
