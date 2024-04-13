const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const token =
    req.headers.authorization && req.headers.authorization.split(" ")[1];
  const userID = req.headers.userid && req.headers.userid;
  const email = req.headers.email && req.headers.email;

  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (
      err ||
      decoded === undefined ||
      userID != decoded.id ||
      email != decoded.email
    ) {
      return res.status(401).json({ message: "Unauthorized" });
    } else {
      req.user = decoded;
      next();
    }
  });
}

module.exports = authMiddleware;
