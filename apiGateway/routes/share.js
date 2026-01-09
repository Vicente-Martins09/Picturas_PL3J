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


router.get("/project/:token", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    const projectResp = await axios.get(`${projectsURL}${createdBy}/${projectId}`, { httpsAgent });

    res.status(200).json({ ...projectResp.data, share: { permission } });
  } catch (e) {
    res.status(400).json("Invalid or expired link");
  }
});

router.post("/project/:token/reorder", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.post(
      `${projectsURL}${createdBy}/${projectId}/reorder`,
      req.body, // newTools
      { httpsAgent }
    );

    return res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    const status = e.response?.status || 503;
    return res.status(status).jsonp(e.response?.data || "Error reordering tools");
  }
});

router.post("/project/:token/process", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.post(
      `${projectsURL}${createdBy}/${projectId}/process`,
      req.body,
      { httpsAgent }
    );

    return res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    return res.status(400).jsonp(e.response?.data || "Invalid or expired link");
  }
});

router.get("/project/:token/process/url", async (req, res) => {
  try {
    const { token } = req.params;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy } = shareResp.data;

    const resp = await axios.get(
      `${projectsURL}${createdBy}/${projectId}/process/url`,
      { httpsAgent }
    );

    res.status(200).send(resp.data);
  } catch (err) {
    res.status(500).jsonp("Error getting processing results");
  }
});


router.delete("/project/:token/tool/:toolId", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.delete(
      `${projectsURL}${createdBy}/${projectId}/tool/${req.params.toolId}`,
      { httpsAgent }
    );

    return res.sendStatus(resp.status);
  } catch (e) {
    return res.status(400).jsonp(e.response?.data || "Invalid or expired link");
  }
});



router.post("/project/:token/cancel", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.post(
      `${projectsURL}${createdBy}/${projectId}/cancel`,
      {},
      { httpsAgent }
    );

    return res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    const status = e.response?.status || 503;
    return res.status(status).jsonp(e.response?.data || "Error cancelling");
  }
});

router.post("/project/:token/tool", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.post(
      `${projectsURL}${createdBy}/${projectId}/tool`,
      req.body, // { procedure, params }
      { httpsAgent }
    );

    return res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    const status = e.response?.status || 503;
    return res.status(status).jsonp(e.response?.data || "Error adding tool");
  }
});

router.delete("/project/:token/tools", async (req, res) => {
  try {
    const { token } = req.params;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") {
      return res.status(403).jsonp("Share link does not allow editing");
    }

    // buscar tools atuais
    const projectResp = await axios.get(`${projectsURL}${createdBy}/${projectId}`, { httpsAgent });
    const tools = projectResp.data?.tools ?? [];

    // apagar tools uma a uma (como fazias no frontend)
    for (const t of tools) {
      await axios.delete(`${projectsURL}${createdBy}/${projectId}/tool/${t._id}`, { httpsAgent });
    }

    return res.sendStatus(204);
  } catch (e) {
    const status = e.response?.status || 400;
    return res.status(status).jsonp(e.response?.data || "Error clearing tools");
  }
});

router.get("/project/:token/download/results", async (req, res) => {
  try {
    const { token } = req.params;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy } = shareResp.data;

    const resp = await axios.get(`${projectsURL}${createdBy}/${projectId}/process`, {
      httpsAgent,
      responseType: "stream",
    });

    // passar headers e stream
    res.status(resp.status);
    Object.entries(resp.headers).forEach(([k, v]) => res.setHeader(k, v));
    resp.data.pipe(res);
  } catch (e) {
    const status = e.response?.status || 400;
    return res.status(status).jsonp(e.response?.data || "Error downloading results");
  }
});




router.put("/project/:token/tool/:toolId", async (req, res) => {
  try {
    const token = req.params.token;
    const toolId = req.params.toolId;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.put(
      `${projectsURL}${createdBy}/${projectId}/tool/${toolId}`,
      req.body, // { params }
      { httpsAgent }
    );

    return res.sendStatus(resp.status);
  } catch (e) {
    const status = e.response?.status || 503;
    return res.status(status).jsonp(e.response?.data || "Error updating tool");
  }
});

router.post("/project/:token/preview/:img", async (req, res) => {
  try {
    const token = req.params.token;

    const shareResp = await axios.get(`${shareURL}validate/${token}`, { httpsAgent });
    const { projectId, createdBy, permission } = shareResp.data;

    if (permission !== "EDIT") return res.status(403).jsonp("Share link is READ-only");

    const resp = await axios.post(
      `${projectsURL}${createdBy}/${projectId}/preview/${req.params.img}`,
      req.body,
      { httpsAgent }
    );

    return res.status(resp.status).jsonp(resp.data);
  } catch (e) {
    return res.status(400).jsonp(e.response?.data || "Invalid or expired link");
  }
});


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





module.exports = router;
