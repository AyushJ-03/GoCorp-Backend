import mongoose from "mongoose";

const batchSchema = new mongoose.Schema({
  office_id: mongoose.Schema.Types.ObjectId,
  direction: String,
  scheduled_at: Date,
  route_polyline: Object,
}, { timestamps: true });

export const RideBatch = mongoose.model("RideBatch", batchSchema);