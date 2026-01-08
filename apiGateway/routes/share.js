var express = require("express");
var router = express.Router();

const axios = require("axios");

const https = require("https");
const fs = require("fs");

const { checkToken } = require("../auth/auth");

// Certificados do API Gateway (igual aos outros routes do gateway)
const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");


const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  cert: cert,
  key: key,
});

// Endereço do microserviço share dentro do docker network
const shareURL = "https://share:12001/";
const projectsURL = "https://projects:9001/";

/**
 * Criar partilha (apenas utilizadores autenticados)
 * POST /share/:user
 * body: { projectId, permission }
 */
router.post("/:user", checkToken, async (req, res) => {
  try {
    const userId = req.params.user;
    const { projectId, permission } = req.body;

    if (!projectId || !permission) {
      res.status(400).jsonp("Missing projectId or permission");
      return;
    }

    // 1) validar que o projeto existe e pertence ao user
    await axios.get(projectsURL + `${userId}/${projectId}`, { httpsAgent });

    // 2) criar share no share-ms
    const resp = await axios.post(
      shareURL + `${userId}`,
      { projectId, permission },
      { httpsAgent }
    );

    res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    const status = e.response?.status || 503;

    // se o projects-ms deu 404/501, traduz para erro claro
    if (e.response && e.response.config?.url?.includes("projects")) {
      res.status(404).jsonp("Project not found for this user");
      return;
    }

    res.status(status).jsonp(e.response?.data || "Error creating share link");
  }
});


/**
 * Validar link (pode ser usado por anónimo)
 * GET /share/validate/:token
 */
router.get("/validate/:token", async (req, res) => {
  try {
    const token = req.params.token;

    const resp = await axios.get(shareURL + `validate/${token}`, { httpsAgent });
    res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    const status = e.response?.status || 403;
    res.status(status).jsonp(e.response?.data || "Invalid or expired link");
  }
});

/**
 * Revogar partilha (apenas dono autenticado)
 * DELETE /share/:user/:shareId
 */
router.delete("/:user/:shareId", checkToken, async (req, res) => {
  try {
    const { user, shareId } = req.params;

    const resp = await axios.delete(shareURL + `${user}/${shareId}`, { httpsAgent });
    res.sendStatus(resp.status);
  } catch (e) {
    const status = e.response?.status || 503;
    res.status(status).jsonp(e.response?.data || "Error revoking share link");
  }
});

/**
 * Listar links ativos de um projeto (RF54)
 * GET /share/:user/project/:projectId
 */
router.get("/:user/project/:projectId", checkToken, async (req, res) => {
  try {
    const { user, projectId } = req.params;

    const resp = await axios.get(shareURL + `${user}/project/${projectId}`, { httpsAgent });
    res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    const status = e.response?.status || 503;
    res.status(status).jsonp(e.response?.data || "Error listing share links");
  }
});

module.exports = router;
