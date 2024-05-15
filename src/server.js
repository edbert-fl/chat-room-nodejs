const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");

const app = express();

const allowedOrigins = ['https://chat-room-henna.vercel.app', 'https://localhost:3000'];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

const { initializeRoutes } = require("./routes");

initializeRoutes(app);

const PORT = process.env.PORT;

const options = {
  key: fs.readFileSync('.certs/info2222.chat-app-nodejs.key'),
  cert: fs.readFileSync('.certs/info2222.chat-app-nodejs.crt')
};

// Create an HTTP server using Express app
https.createServer(options, app).listen(PORT, function () {
  console.log(`CORS-enabled web server listening on port ${PORT}`);
});