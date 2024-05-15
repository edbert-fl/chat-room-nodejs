const { PrismaClient } = require("@prisma/client");
const { devlog } = require("./helpers");
const CryptoJS = require("crypto-js");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const authMiddleware = require("./authMiddleware");
const validator = require("validator");

const ACCESS_LEVEL = {
  STUDENT: 1,
  ACADEMIC: 2,
  ADMINISTRATIVE: 3,
  ADMIN: 4,
};

module.exports.initializeRoutes = (app) => {
  const prisma = new PrismaClient();

  // Handle WebSocket connections
  const WebSocketServer = require("./websocket");

  const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 8080;
  const wss = new WebSocketServer({ port: WEBSOCKET_PORT });

  app.get("/api", function (req, res, next) {
    res.json({ msg: "This is CORS-enabled for all origins!" });
  });

  /* 
  Login to a user account
  */
  app.post("/user/login", async function (req, res) {
    const { username, password } = req.body;
    const validatedUsername = validator.escape(username);
    const validatedPassword = validator.escape(password);

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
      const hashedInputPassword = CryptoJS.SHA256(
        validatedPassword + user.salt
      );
      const hashedPasswordString = hashedInputPassword.toString(
        CryptoJS.enc.Base64
      );

      const serverHashedPassword = CryptoJS.SHA256(
        hashedPasswordString + user.salt
      );
      const serverHashedPasswordString = serverHashedPassword.toString(
        CryptoJS.enc.Base64
      );

      if (serverHashedPasswordString !== user.hashed_password) {
        devlog(`Invalid password`);
        return res.status(401).json({ error: "Invalid password" });
      }

      devlog(`Authentication successful!`);
      const responseData = {
        id: user.user_id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        salt: user.salt,
        muted: user.muted,
        role: user.role,
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

    const serverHashedPassword = CryptoJS.SHA256(hashedPassword + salt);
    const serverHashedPasswordString = serverHashedPassword.toString(
      CryptoJS.enc.Base64
    );

    if (!validator.isEmail(validatedEmail)) {
      res.status(400).json({ success: false, error: "Invalid email address" });
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
          hashed_password: serverHashedPasswordString,
          salt: salt,
          role: ACCESS_LEVEL.STUDENT,
        },
      });

      devlog(`User added successfully, returning result.`);
      const responseData = {
        id: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        createdAt: newUser.created_at,
        muted: newUser.muted,
        role: newUser.role,
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

  app.post("/user/toggle/mute", async (req, res) => {
    const { userId } = req.body;

    try {
      // Find the current status of the user
      const user = await prisma.user.findUnique({
        where: {
          user_id: userId,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Toggle the muted status
      const updatedUser = await prisma.user.update({
        where: {
          user_id: userId,
        },
        data: {
          muted: !user.muted,
        },
      });

      res.status(200).json({
        success: true,
        message: `User ${updatedUser.muted ? "muted" : "unmuted"} successfully`,
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error toggling mute status:", error);
      res.status(500).json({
        success: false,
        error: "Error toggling mute status",
      });
    }
  });

  app.delete("/comment/delete", async (req, res) => {
    const { commentId } = req.body;

    try {
      // Find the comment to ensure it exists
      const comment = await prisma.comment.findUnique({
        where: {
          comment_id: commentId,
        },
      });

      if (!comment) {
        return res.status(404).json({
          success: false,
          error: "Comment not found",
        });
      }

      // Delete the comment
      await prisma.comment.delete({
        where: {
          comment_id: commentId,
        },
      });

      res.status(200).json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({
        success: false,
        error: "Error deleting comment",
      });
    } finally {
      await prisma.$disconnect();
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
  app.post(
    "/user/get/friend-requests",
    authMiddleware,
    async function (req, res) {
      const { userID } = req.body;

      try {
        const friendRequests = await prisma.friendRequest.findMany({
          where: { receiver_id: userID },
          include: {
            sender: true,
          },
        });

        const formattedFriendRequests = friendRequests.map((friendRequest) => ({
          id: friendRequest.id,
          sender: { ...friendRequest.sender, id: friendRequest.sender_id },
          receiverID: friendRequest.receiver_id,
          accepted: friendRequest.accepted,
          createdAt: friendRequest.created_at,
        }));

        res.json({ success: true, friendRequests: formattedFriendRequests });
      } catch (error) {
        console.error("Error fetching user's friend requests:", error);
        res.status(500).json({
          success: false,
          error: "Failed to fetch user's friend requests",
        });
      }
    }
  );

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
        return res.status(404).json({
          success: false,
          error: "Request sent from invalid account.",
        });
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

  app.post("/friend/delete", authMiddleware, async function (req, res) {
    const { user1Id, user2Id } = req.body;

    try {
      // Find the friendship in either order
      const friendship = await prisma.friend.findFirst({
        where: {
          OR: [
            { user1Id: user1Id, user2Id: user2Id },
            { user1Id: user2Id, user2Id: user1Id },
          ],
        },
      });

      if (!friendship) {
        return res
          .status(404)
          .json({ success: false, error: "Friendship not found." });
      }

      // Delete the friendship
      await prisma.friend.deleteMany({
        where: {
          OR: [
            { user1Id: user1Id, user2Id: user2Id },
            { user1Id: user2Id, user2Id: user1Id },
          ],
        },
      });

      res.status(200).json({
        success: true,
        message: "Friend deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting friend:", error);
      res.status(500).json({ success: false, error: "Error deleting friend." });
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

  /**
   * Write a new article
   */
  app.post("/article/create", authMiddleware, async function (req, res) {
    const { author_id, title, content, sponsored_by } = req.body;

    console.log({ author_id, title, content, sponsored_by });
    try {
      // Save article to the database
      const savedArticle = await prisma.article.create({
        data: {
          author_id,
          title,
          content,
          sponsored_by,
        },
        include: {
          author: true,
        },
      });

      // Transform the saved article before sending the response
      const transformedArticle = {
        ...savedArticle,
        author: {
          ...savedArticle.author,
          id: savedArticle.author.user_id,
        },
        createdAt: savedArticle.created_at, // Assuming `created_at` is the field in the database
      };

      console.log(transformedArticle);

      res.status(200).json({ success: true, article: transformedArticle });
    } catch (error) {
      console.error("Error creating article:", error);
      res
        .status(500)
        .json({ success: false, error: "Error creating article." });
    }
  });

  /**
   * Edit an article
   */
  app.post("/article/edit", authMiddleware, async function (req, res) {
    const { article_id, title, content } = req.body;

    try {
      // Fetch the article from the database
      const existingArticle = await prisma.article.findUnique({
        where: {
          article_id: article_id,
        },
        include: {
          author: true,
        },
      });

      if (!existingArticle) {
        return res
          .status(404)
          .json({ success: false, error: "Article not found." });
      }

      // Update the article with the new title or content
      const updatedArticle = await prisma.article.update({
        where: {
          article_id: article_id,
        },
        data: {
          title: title || existingArticle.title, // Update title if provided, otherwise keep the existing title
          content: content || existingArticle.content, // Update content if provided, otherwise keep the existing content
        },
        include: {
          author: true,
        },
      });

      // Transform the updated article before sending the response
      const transformedArticle = {
        ...updatedArticle,
        updatedAt: updatedArticle.updated_at, // Assuming `updated_at` is the field in the database
      };

      console.log(transformedArticle);

      res.status(200).json({ success: true, article: transformedArticle });
    } catch (error) {
      console.error("Error editing article:", error);
      res.status(500).json({ success: false, error: "Error editing article." });
    }
  });

  /**
   * Get all articles
   */
  app.get("/articles", async function (req, res) {
    try {
      // Fetch all articles from the database
      const articles = await prisma.article.findMany({
        include: {
          author: true,
        },
      });

      // Transform each article before sending the response
      const transformedArticles = articles.map((article) => ({
        ...article,
        author: {
          ...article.author,
          id: article.author.user_id,
        },
        createdAt: article.created_at, // Assuming `created_at` is the field in the database
      }));

      res.status(200).json({ success: true, articles: transformedArticles });
    } catch (error) {
      console.error("Error fetching articles:", error);
      res
        .status(500)
        .json({ success: false, error: "Error fetching articles." });
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

  app.post("/comments/create", authMiddleware, async function (req, res) {
    const { article_id, author_id, content } = req.body;

    try {
      // Save comment to the database
      const savedComment = await prisma.comment.create({
        data: {
          article_id,
          author_id,
          content,
        },
        include: {
          article: true,
          author: true,
        },
      });

      res.status(200).json({ success: true, comment: savedComment });
    } catch (error) {
      console.error("Error creating comment:", error);
      res
        .status(500)
        .json({ success: false, error: "Error creating comment." });
    }
  });

  app.get("/comments", async function (req, res) {
    const { article_id } = req.query;

    try {
      // Fetch comments for the specified article from the database
      const comments = await prisma.comment.findMany({
        where: {
          article_id: Number(article_id),
        },
        include: {
          article: true,
          author: true,
        },
      });

      res.status(200).json({ success: true, comments });
    } catch (error) {
      console.error("Error fetching comments:", error);
      res
        .status(500)
        .json({ success: false, error: "Error fetching comments." });
    }
  });

  app.post("/groups/create", authMiddleware, async function (req, res) {
    const { name, groupOwnerId } = req.body;

    try {
      const newGroup = await prisma.group.create({
        data: {
          name,
          groupOwnerId,
        },
        include: {
          groupOwner: true,
        },
      });

      await prisma.groupMember.create({
        data: {
          userId: groupOwnerId,
          groupId: newGroup.id,
        },
      });

      res.status(200).json({ success: true, group: newGroup });
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ success: false, error: "Error creating group." });
    }
  });

  app.post(
    "/groups/:groupId/invite",
    authMiddleware,
    async function (req, res) {
      const { groupId } = req.params;
      const { senderId, receiverName } = req.body;

      try {
        // Find the user by their username
        const receiver = await prisma.user.findUnique({
          where: {
            username: receiverName,
          },
        });

        if (!receiver) {
          return res
            .status(404)
            .json({ success: false, error: "Receiver not found." });
        }

        // Create the group invite
        const groupInvite = await prisma.groupInvite.create({
          data: {
            groupId: Number(groupId),
            senderId: Number(senderId),
            receiverId: receiver.user_id,
            accepted: false,
          },
        });

        res.status(200).json({ success: true, groupInvite });
      } catch (error) {
        console.error("Error creating invite:", error);
        res
          .status(500)
          .json({ success: false, error: "Error creating invite." });
      }
    }
  );

  app.post(
    "/invites/:inviteId/accept",
    authMiddleware,
    async function (req, res) {
      const { inviteId } = req.params;

      try {
        const invite = await prisma.groupInvite.update({
          where: { id: Number(inviteId) },
          data: { accepted: true },
        });

        await prisma.groupMember.create({
          data: {
            userId: invite.receiverId,
            groupId: invite.groupId,
          },
        });

        res.status(200).json({ success: true, message: "Invite accepted." });
      } catch (error) {
        console.error("Error accepting invite:", error);
        res
          .status(500)
          .json({ success: false, error: "Error accepting invite." });
      }
    }
  );

  app.post(
    "/invites/:inviteId/decline",
    authMiddleware,
    async function (req, res) {
      const { inviteId } = req.params;

      try {
        await prisma.groupInvite.delete({
          where: { id: Number(inviteId) },
        });

        res.status(200).json({ success: true, message: "Invite declined." });
      } catch (error) {
        console.error("Error declining invite:", error);
        res
          .status(500)
          .json({ success: false, error: "Error declining invite." });
      }
    }
  );

  /**
   * Get all group messages for a particular group
   */
  app.get(
    "/groups/:groupId/messages",
    authMiddleware,
    async function (req, res) {
      const { groupId } = req.params;

      console.log(groupId);
      try {
        const messages = await prisma.groupMessage.findMany({
          where: {
            groupId: Number(groupId),
          },
          include: {
            sender: true,
          },
        });

        // Format messages as needed
        const formattedMessages = messages.map((message) => ({
          id: message.id,
          sender: message.sender,
          receiver: null, // Receiver may not be defined in the group context
          message: message.content,
          sentAt: message.sentAt,
        }));

        res.status(200).json({ success: true, messages: formattedMessages });
      } catch (error) {
        console.error("Error fetching group messages:", error);
        res
          .status(500)
          .json({ success: false, error: "Error fetching group messages." });
      }
    }
  );

  app.post(
    "/groups/:groupId/message/send",
    authMiddleware,
    async function (req, res) {
      const { groupId } = req.params;
      const { senderId, content } = req.body;

      console.log(senderId);

      try {
        const message = await prisma.groupMessage.create({
          data: {
            senderId: Number(senderId),
            groupId: Number(groupId),
            content: content,
          },
          include: {
            sender: true,
          },
        });

        const formattedMessage = {
          id: message.id,
          sender: message.sender,
          receiver: null, // Since receiver isn't defined in the group context
          message: message.content,
          sentAt: message.sentAt,
        };

        res.status(200).json({ success: true, message: formattedMessage });
      } catch (error) {
        console.error("Error sending message:", error);
        res
          .status(500)
          .json({ success: false, error: "Error sending message." });
      }
    }
  );

  app.get("/users/:userId/groups", authMiddleware, async function (req, res) {
    const { userId } = req.params;

    try {
      const groups = await prisma.group.findMany({
        where: {
          members: {
            some: {
              userId: Number(userId),
            },
          },
        },
        include: {
          groupOwner: true,
          members: {
            include: {
              user: true,
            },
          },
        },
      });

      res.status(200).json({ success: true, groups });
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ success: false, error: "Error fetching groups." });
    }
  });

  app.get("/users/:userId/invites", authMiddleware, async function (req, res) {
    const { userId } = req.params;

    try {
      const invites = await prisma.groupInvite.findMany({
        where: {
          receiverId: Number(userId),
        },
        include: {
          sender: true,
          group: true,
        },
      });

      res.status(200).json({ success: true, invites });
    } catch (error) {
      console.error("Error fetching invites:", error);
      res
        .status(500)
        .json({ success: false, error: "Error fetching invites." });
    }
  });
};
