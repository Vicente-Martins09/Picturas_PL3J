const mongoose = require("mongoose");

const ShareSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true },
  token: { type: String, required: true, unique: true },
  permission: {type: String, enum: ["READ", "EDIT"], required: true},
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  revoked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(+new Date() + 7*24*60*60*1000) }, // Default to 7 days from now
});

ShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Share", ShareSchema);
