const { pool } = require("./database");
const { devlog } = require("./helpers");
const { SHA256 } = require("crypto-js")

module.exports.initializeRoutes = (app) => {
  app.get("/api", function (req, res, next) {
    res.json({ msg: "This is CORS-enabled for all origins!" });
  });

  /* 
  Login to a user account
  */
  app.post("/user/login", async function (req, res) {
    const { username, password } = req.body;
    let client;

    try {
      devlog(`Logging into ${username}'s account`);
      devlog(`Connecting to database...`);
      client = await pool.connect();

      // Retrieve hashed password and salt from the database for the specified email
      const userResult = await client.query(
        "SELECT * FROM users WHERE username = $1",
        [username]
      );
      devlog(`\n\$Information retrieved successfully`);
      const userResultData = userResult.rows[0];

      devlog(`${username}'s data : userResultData`)

      if (userResult.rows.length === 1) {
        const storedHashedPassword = userResultData.hashed_password;
        const salt = userResultData.salt;

        // Use the retrieved salt to hash the user's typed password
        devlog(`Hashing input password`)
        const hashedInputPassword = crypto.SHA256(password + salt);

        // Compare the typed password and the stored hash password from the database
        devlog(`Comparing input password and stored hashed password`)
        if (hashedInputPassword === storedHashedPassword) {
          devlog(`Authentication successful!`)
          const responseData = {
            id: userResultData.user_id,
            name: userResultData.username,
            email: userResultData.email,
            salt: userResultData.salt,
            created_at: userResultData.created_at
          };
          res.status(200).json({
            user: responseData,
            message: "Authentication successful!",
          });
        } else {
          devlog(`Passwords are not the same`)
          res.status(401).json({ message: "Passwords are not the same" });
        }
      } else {
        res.status(404).json({ message: "User not found"});
      }
    } catch (error) {
      console.error("Error during login", error);
      res
        .status(500)
        .json({ message: "Internal Server Error", details: error.message });
    } finally {
      if (client) {
        client.release();
      }
    }
  });

  /* 
  Register a new user
  */
  app.post("/user/register", async function (req, res) {
    const { username, email, hashedPassword, salt } = req.body;
    let client;

    try {
      devlog(`\n\nRegistering new account`);
      devlog(`Connecting to database...`);
      client = await pool.connect();

      devlog(`Checking if username or email already in use`);
      const existingUser = await client.query(
        "SELECT * FROM users WHERE username = $1 OR email = $2",
        [username, email]
      );
      
      if (existingUser.rows.length > 0) {
        devlog(`Username or email already in use.`);
        return res.status(400).json({ error: "Username or email already in use" });
      }
      devlog(`Check complete. Both username and email are both unique`);

      devlog(`Creating new user`);
      const result = await client.query(
        "INSERT INTO users (username, email, hashed_password, salt) VALUES ($1, $2, $3, $4) RETURNING *",
        [username, email, hashedPassword, salt]
      );
      const userResultData = result.rows[0]

      devlog(`User added successfully, returning result.`);
      const responseData = {
        id: userResultData.user_id,
        name: userResultData.username,
        email: userResultData.email,
        salt: userResultData.salt,
        created_at: userResultData.created_at
      };
      res.status(200).json({
        user: responseData,
        message: "User added successfully!",
      });
    } catch (error) {
      devlog(`ERROR\t${error.message}`);
      res
        .status(500)
        .json({ message: "Internal Server Error", details: error.message });
    } finally {
      if (client) {
        client.release();
      }
    }
  });
};
