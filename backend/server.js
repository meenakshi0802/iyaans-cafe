import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authMiddleware from "./middleware/authMiddleware.js";

import itemRoutes from "./routes/itemRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import authRoutes from "./routes/authRoutes.js";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected Successfully");
  })
  .catch((error) => {
    console.error(
      "MongoDB Connection Failed:",
      error.message
    );
  });

// API Routes
app.use("/api/items", authMiddleware, itemRoutes);
app.use("/api/orders", authMiddleware, orderRoutes);
// Home Route
app.get("/", (req, res) => {
  res.send("IYYAANS CAFE Backend is Running!");
});

// Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});