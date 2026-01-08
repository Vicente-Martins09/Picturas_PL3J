var express = require("express");
var router = express.Router();
const validator = require("validator");

const ShareController = require("../controllers/share");

function isValidObjectId(id) {
  return typeof id === "string" && validator.isMongoId(id);
}

function isValidPermission(p) {
  return p === "READ" || p === "EDIT";
}

// Criar link
router.post("/:user", async (req, res) => {
  try {
    const userId = req.params.user;
    const { projectId, permission } = req.body;

    if (!isValidObjectId(userId))
      return res.status(400).jsonp({ error: "user inválido" });

    if (!isValidObjectId(projectId))
      return res.status(400).jsonp({ error: "projectId inválido" });

    if (!isValidPermission(permission))
      return res.status(400).jsonp({ error: "permission inválida (READ|EDIT)" });

    const share = await ShareController.create(userId, projectId, permission);

    return res.status(201).jsonp({
      _id: share._id,
      token: share.token,
      projectId: share.projectId,
      permission: share.permission,
      expiresAt: share.expiresAt,
    });
  } catch (e) {
    return res.status(503).jsonp({ error: "Erro a criar link" });
  }
});

// Validar token
router.get("/validate/:token", async (req, res) => {
  try {
    const share = await ShareController.validate(req.params.token);

    if (!share)
      return res.status(403).jsonp({ error: "Link inválido ou expirado" });

    return res.status(200).jsonp({
      projectId: share.projectId,
      permission: share.permission,
    });
  } catch (e) {
    return res.status(503).jsonp({ error: "Erro a validar link" });
  }
});

// Revogar link
router.delete("/:user/:shareId", async (req, res) => {
  try {
    const userId = req.params.user;
    const shareId = req.params.shareId;

    if (!isValidObjectId(userId) || !isValidObjectId(shareId))
      return res.status(400).jsonp({ error: "IDs inválidos" });

    const updated = await ShareController.revoke(shareId, userId);

    if (!updated)
      return res.status(403).jsonp({ error: "Sem permissão para revogar" });

    return res.sendStatus(204);
  } catch (e) {
    return res.status(503).jsonp({ error: "Erro a revogar link" });
  }
});

// Listar links ativos de um projeto
router.get("/:user/project/:projectId", async (req, res) => {
  try {
    const { user, projectId } = req.params;

    if (!isValidObjectId(user) || !isValidObjectId(projectId))
      return res.status(400).jsonp({ error: "IDs inválidos" });

    const links = await ShareController.getActiveByProject(projectId, user);
    return res.status(200).jsonp(links);
  } catch (e) {
    return res.status(503).jsonp({ error: "Erro a listar links" });
  }
});

module.exports = router;
