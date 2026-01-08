const Share = require("../models/share");
const mongoose = require("mongoose");
const crypto = require("crypto");

// criar link
module.exports.create = async (userId, projectId, permission) => {
  return await Share.create({
    projectId: new mongoose.Types.ObjectId(projectId),
    token: crypto.randomUUID(),
    permission,
    createdBy: new mongoose.Types.ObjectId(userId),
  });
};

// validar token (RF53/RF57)
module.exports.validate = async (token) => {
  const share = await Share.findOne({ token }).exec();

  if (!share) return null;
  if (share.revoked) return null;
  if (share.expiresAt < new Date()) return null;

  return share;
};


// revogar link (RF55/RF56)
module.exports.revoke = async (shareId, userId) => {
  return await Share.findOneAndUpdate(
    { _id: shareId, createdBy: userId },
    { revoked: true },
    { new: true }
  ).exec();
};

// listar links ativos de um projeto (RF54)
module.exports.getActiveByProject = async (projectId, userId) => {
  return await Share.find({
    projectId: projectId,
    createdBy: userId,
    revoked: false,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .exec();
};
