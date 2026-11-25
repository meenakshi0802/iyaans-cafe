import "dotenv/config";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

// Hash the admin password when the server starts
const adminPasswordHash = bcrypt.hashSync(
  process.env.ADMIN_PASSWORD || "",
  10
);

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (
      username !== process.env.ADMIN_USERNAME ||
      !password ||
      !bcrypt.compareSync(password, adminPasswordHash)
    ) {
      return res.status(401).json({
        message: "Invalid username or password"
      });
    }

    const token = jwt.sign(
      { username },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.status(200).json({
      message: "Login successful",
      token
    });

  } catch (error) {
    res.status(500).json({
      message: "Login failed"
    });
  }
});

export default router;