import express from "express";
import Item from "../models/item.js";

const router = express.Router();

// GET - Fetch all items
router.get("/", async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST - Add new item
router.post("/", async (req, res) => {
  try {
    const { name, price, category } = req.body;

    const newItem = new Item({
      name,
      price,
      category
    });

    const savedItem = await newItem.save();

    res.status(201).json(savedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;