import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true
    },

    items: [
      {
        id: String,
        name: String,
        price: Number,
        quantity: Number
      }
    ],

    subtotal: {
      type: Number,
      required: true
    },

    tax: {
      type: Number,
      default: 0
    },

    discount: {
      type: Number,
      default: 0
    },

    total: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["Unsettled", "Settled"],
      default: "Unsettled"
    },

    paymentMethod: {
      type: String,
      default: ""
    },

    cashAmount: {
      type: Number,
      default: 0
    },

    gpayAmount: {
      type: Number,
      default: 0
    },

    date: String,
    dateText: String,
    settledAt: String
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Order", orderSchema);
