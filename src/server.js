const express = require("express");
const cors = require("cors");
const http = require("http");

const app = express();

const allowedOrigins = ['https://chat-room-henna.vercel.app', 'http://localhost:3000'];

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

// Create an HTTP server using Express app
http.createServer(app).listen(PORT, function () {
  console.log(`CORS-enabled web server listening on port ${PORT}`);
});
