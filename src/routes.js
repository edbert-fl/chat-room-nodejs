const { PrismaClient } = require('@prisma/client');
const { devlog } = require('./helpers');
const { SHA256, enc } = require('crypto-js')

module.exports.initializeRoutes = (app) => {
  const prisma = new PrismaClient();

  app.get('/api', function (req, res, next) {
    res.json({ msg: 'This is CORS-enabled for all origins!' });
  });

  /* 
  Login to a user account
  */
  app.post('/user/login', async function (req, res) {
    const { username, password } = req.body;

    try {
      devlog(`Logging into ${username}'s account`);

      // Retrieve user by username
      const user = await prisma.user.findUnique({
        where: {
          username: username,
        },
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Compare hashed password with input password
      const hashedInputPassword = SHA256(password + user.salt);
      const hashedPasswordString = hashedInputPassword.toString(enc.Base64);
      if (hashedPasswordString !== user.hashed_password) {
        devlog(`Invalid password`);
        return res.status(401).json({ message: 'Invalid password' });
      }

      devlog(`Authentication successful!`);
      const responseData = {
        id: user.user_id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      };
      res.status(200).json({
        user: responseData,
        message: 'Authentication successful!',
      });
    } catch (error) {
      console.error('Error during login', error);
      res.status(500).json({ message: 'Internal Server Error', details: error.message });
    }
  });

  /* 
  Register a new user
  */
  app.post('/user/register', async function (req, res) {
    const { username, email, salt, hashedPassword } = req.body;

    try {
      devlog(`Registering new account`);

      // Check if username or email already in use
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: username },
            { email: email },
          ],
        },
      });

      if (existingUser) {
        devlog(`Username or email already in use.`);
        return res.status(400).json({ error: 'Username or email already in use' });
      }

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          username: username,
          email: email,
          hashed_password: hashedPassword,
          salt: salt,
        },
      });

      devlog(`User added successfully, returning result.`);
      const responseData = {
        id: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        created_at: newUser.created_at,
      };
      res.status(200).json({
        user: responseData,
        message: 'User added successfully!',
      });
    } catch (error) {
      devlog(`ERROR\t${error.message}`);
      res.status(500).json({ message: 'Internal Server Error', details: error.message });
    }
  });
};
