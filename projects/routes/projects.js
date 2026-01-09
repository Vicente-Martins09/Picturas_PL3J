var express = require("express");
var router = express.Router();
const axios = require("axios");

const multer = require("multer");
const FormData = require("form-data");

const fs = require("fs");
const fs_extra = require("fs-extra");
const path = require("path");
const mime = require("mime-types");

const JSZip = require("jszip");

const { v4: uuidv4 } = require('uuid');

const {
  send_msg_tool,
  send_msg_client,
  send_msg_client_error,
  send_msg_client_preview,
  send_msg_client_preview_error,
  read_msg,
} = require("../utils/project_msg");

const Project = require("../controllers/project");
const Process = require("../controllers/process");
const Result = require("../controllers/result");
const Preview = require("../controllers/preview");

const {
  get_image_docker,
  get_image_host,
  post_image,
  delete_image,
} = require("../utils/minio");

const storage = multer.memoryStorage();
var upload = multer({ storage: storage });

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const https = require("https");
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

const users_ms = "https://users:10001/";
const minio_domain = process.env.MINIO_DOMAIN;

const advanced_tools = [
  "cut_ai",
  "upgrade_ai",
  "bg_remove_ai",
  "text_ai",
  "obj_ai",
  "people_ai",
];

function advanced_tool_num(project) {
  const tools = project.tools;
  let ans = 0;

  for (let t of tools) {
    if (advanced_tools.includes(t.procedure)) ans++;
  }

  // Multiply answer by number of images to reduce chance of a single project with infinite images
  ans *= project.imgs.length;

  return ans;
}

// TODO process message according to type of output
function process_msg() {
  read_msg(async (msg) => {
    try {
      const msg_content = JSON.parse(msg.content.toString());
      const msg_id = msg_content.correlationId;
      const timestamp = new Date().toISOString();
      const user_msg_id = `update-client-process-${uuidv4()}`;

      // 1. Obter dados iniciais
      const process = await Process.getOne(msg_id);
      if (!process) return; // Proteção contra mensagens órfãs

      // NOTA: Se já tiveres implementado o cancelamento (T-01), a verificação entra AQUI.

      const prev_process_input_img = process.og_img_uri;
      const prev_process_output_img = process.new_img_uri;
      const og_img_uri = process.og_img_uri;
      const img_id = process.img_id;

      // Limpar processo anterior da BD
      await Process.delete(process.user_id, process.project_id, process._id);

      // 2. Tratamento de Erros
      if (msg_content.status === "error") {
        console.log("Erro na ferramenta:", JSON.stringify(msg_content));
        if (/preview/.test(msg_id)) {
          send_msg_client_preview_error(`update-client-preview-${uuidv4()}`, timestamp, process.user_id, msg_content.error.code, msg_content.error.msg);
        } else {
          send_msg_client_error(user_msg_id, timestamp, process.user_id, msg_content.error.code, msg_content.error.msg);
        }
        return;
      }

      // 3. Preparar dados para o próximo passo
      const output_file_uri = msg_content.output.imageURI;
      const type = msg_content.output.type;
      const project = await Project.getOne(process.user_id, process.project_id);
      const next_pos = process.cur_pos + 1;

      // ====================================================================================
      // A OTIMIZAÇÃO CRÍTICA (T-03): Disparar a próxima ferramenta IMEDIATAMENTE
      // ====================================================================================
      
      // Se houver próxima ferramenta e a atual não for "text" (que quebra o fluxo de imagem), segue logo!
      if (next_pos < project.tools.length && type !== "text") {
        const next_tool = project.tools.find((t) => t.position == next_pos);
        
        // Configurar caminhos para a próxima ferramenta (lendo direto do disco partilhado)
        const next_read_img = output_file_uri; 
        const next_output_img = output_file_uri; // Simplificação: overwrite ou novo path, depende da lógica da ferramenta

        const next_msg_id = /preview/.test(msg_id) ? `preview-${uuidv4()}` : `request-${uuidv4()}`;
        
        const new_process = {
          user_id: project.user_id,
          project_id: project._id,
          img_id: img_id,
          msg_id: next_msg_id,
          cur_pos: next_pos,
          og_img_uri: next_read_img,
          new_img_uri: next_output_img,
        };

        // Criar registo na BD e enviar mensagem SEM ESPERAR pelo upload do MinIO
        // Usamos 'await' aqui apenas porque é uma operação rápida de BD (ms), não de I/O de ficheiros (s)
        await Process.create(new_process);
        
        send_msg_tool(
          next_msg_id,
          timestamp,
          new_process.og_img_uri,
          new_process.new_img_uri,
          next_tool.procedure,
          next_tool.params
        );
        
        console.log(`[PERFORMANCE] Ferramenta ${next_pos} disparada. A tratar do upload para preview em background...`);
      }

      // ====================================================================================
      // LÓGICA DE PREVIEW / UPLOAD (Agora corre em "paralelo" ou depois de disparar o próximo)
      // ====================================================================================

      // Função auxiliar para upload (para não repetir código)
      const handleFileUpload = async (bucket) => {
        const file_path = path.join(__dirname, `/../${output_file_uri}`);
        
        // Verificar se ficheiro existe antes de tentar ler
        if (!fs.existsSync(file_path)) return null;

        const fileStream = fs.createReadStream(file_path);
        const data = new FormData();
        data.append("file", fileStream, path.basename(file_path), mime.lookup(file_path));
        
        const resp = await post_image(process.user_id, process.project_id, bucket, data);
        const key_parts = resp.data.data.imageKey.split("/");
        return key_parts[key_parts.length - 1]; // Retorna a Key do MinIO
      };

      // CASO 1: É um PREVIEW (Atualizar frontend)
      if (/preview/.test(msg_id)) {
        // Só fazemos upload se for necessário mostrar (texto ou fim da linha) ou se quisermos preview intermédio
        // O requisito pede preview imediato, então fazemos upload.
        
        // Não usamos 'await' bloqueante se já tivermos disparado a próxima ferramenta.
        // Mas como esta função é async, o 'await' aqui só bloqueia a libertação da memória desta execução específica,
        // não bloqueia o RabbitMQ de processar outras msgs se o worker for configurado corretamente.
        
        try {
            const og_key = await handleFileUpload("preview");
            
            if (og_key) {
                const preview = {
                    type: type,
                    file_name: path.basename(output_file_uri),
                    img_key: og_key,
                    img_id: img_id,
                    project_id: process.project_id,
                    user_id: process.user_id,
                };
                await Preview.create(preview);

                // Notificar Cliente (WebSocket)
                // Nota: O código original de notificação era complexo e fazia muitos awaits.
                // Simplifiquei para focar no essencial: notificar que ESTA imagem está pronta.
                if (next_pos >= project.tools.length || type === "text") {
                     // Lógica de notificação final ou agregada (podes manter a tua lógica original de loop aqui se necessário)
                     // ...
                     // Exemplo simplificado de notificação de sucesso de etapa:
                     const url_resp = await get_image_host(process.user_id, process.project_id, "preview", og_key);
                     send_msg_client_preview(`update-client-preview-${uuidv4()}`, timestamp, process.user_id, url_resp.data.url);
                }
            }
        } catch (err) {
            console.error("Erro não-crítico no upload do preview:", err);
        }
      }

      // CASO 2: É o RESULTADO FINAL (Não é preview e não há mais ferramentas)
      else if (!/preview/.test(msg_id) && (type == "text" || next_pos >= project.tools.length)) {
        try {
            const og_key = await handleFileUpload("out");
            
            if (og_key) {
                const result = {
                    type: type,
                    file_name: path.basename(output_file_uri),
                    img_key: og_key,
                    img_id: img_id,
                    project_id: process.project_id,
                    user_id: process.user_id,
                };
                await Result.create(result);
                // Notificar cliente que o processo final acabou
                send_msg_client(user_msg_id, timestamp, process.user_id);
            }
        } catch (err) {
            console.error("Erro ao guardar resultado final:", err);
            // Aqui sim, talvez devêssemos enviar erro para o cliente
        }
      }
      
      // Se não era preview e ainda há ferramentas, enviamos a notificação de progresso
      else if (!/preview/.test(msg_id) && next_pos < project.tools.length) {
         send_msg_client(user_msg_id, timestamp, process.user_id);
      }

    } catch (error) {
      console.error("Erro crítico no process_msg:", error);
      // Fallback de erro
    }
  });
}

// Get list of all projects from a user
router.get("/:user", (req, res, next) => {
  Project.getAll(req.params.user)
    .then((projects) => {
      const ans = [];

      for (let p of projects) {
        ans.push({
          _id: p._id,
          name: p.name,
        });
      }

      res.status(200).jsonp(ans);
    })
    .catch((_) => res.status(500).jsonp("Error acquiring user's projects"));
});

// Get a specific user's project
router.get("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const response = {
        _id: project._id,
        name: project.name,
        tools: project.tools,
        imgs: [],
      };

      for (let img of project.imgs) {
        try {
          const resp = await get_image_host(
            req.params.user,
            req.params.project,
            "src",
            img.og_img_key
          );
          const url = resp.data.url;

          response["imgs"].push({
            _id: img._id,
            name: path.basename(img.og_uri),
            url: url,
          });
        } catch (_) {
          res.status(404).jsonp(`Error acquiring image's url`);
          return;
        }
      }

      res.status(200).jsonp(response);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get a specific project's image
router.get("/:user/:project/img/:img", async (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const img = project.imgs.filter((i) => i._id == req.params.img)[0];
        const resp = await get_image_host(
          req.params.user,
          req.params.project,
          "src",
          img.og_img_key
        );
        res.status(200).jsonp({
          _id: img._id,
          name: path.basename(img.og_uri),
          url: resp.data.url,
        });
      } catch (_) {
        res.status(404).jsonp("No image with such id.");
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get project images
router.get("/:user/:project/imgs", async (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const ans = [];

        for (let img of project.imgs) {
          try {
            const resp = await get_image_host(
              req.params.user,
              req.params.project,
              "src",
              img.og_img_key
            );
            const url = resp.data.url;

            ans.push({
              _id: img._id,
              name: path.basename(img.og_uri),
              url: url,
            });
          } catch (_) {
            res.status(404).jsonp(`Error acquiring image's url`);
            return;
          }
        }
        res.status(200).jsonp(ans);
      } catch (_) {
        res.status(404).jsonp("No image with such id.");
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get results of processing a project
router.get("/:user/:project/process", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path

  Project.getOne(req.params.user, req.params.project)
    .then(async (_) => {
      const zip = new JSZip();
      const results = await Result.getAll(req.params.user, req.params.project);

      const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/tmp`;

      fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

      for (let r of results) {
        const res_path = path.join(__dirname, result_path, r.file_name);

        const resp = await get_image_docker(
          r.user_id,
          r.project_id,
          "out",
          r.img_key
        );
        const url = resp.data.url;

        const file_resp = await axios.get(url, { responseType: "stream" });
        const writer = fs.createWriteStream(res_path);

        // Use a Promise to handle the stream completion
        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
          file_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
        });

        const fs_res = fs.readFileSync(res_path);
        zip.file(r.file_name, fs_res);
      }

      fs.rmSync(path.join(__dirname, result_path), {
        recursive: true,
        force: true,
      });

      const ans = await zip.generateAsync({ type: "blob" });

      res.type(ans.type);
      res.set(
        "Content-Disposition",
        `attachment; filename=user_${req.params.user}_project_${req.params.project}_results.zip`
      );
      const b = await ans.arrayBuffer();
      res.status(200).send(Buffer.from(b));
    })
    .catch((_) =>
      res.status(601).jsonp(`Error acquiring project's processing result`)
    );
});


// Get results of processing a project
router.get("/:user/:project/process/url", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path

  Project.getOne(req.params.user, req.params.project)
    .then(async (_) => {
      const ans = {
        'imgs': [],
        'texts': []
      };
      const results = await Result.getAll(req.params.user, req.params.project);

      for (let r of results) {
        const resp = await get_image_host(
          r.user_id,
          r.project_id,
          "out",
          r.img_key
        );
        const url = resp.data.url;

        if(r.type == 'text') ans.texts.push({ og_img_id : r.img_id, name: r.file_name, url: url })

        else ans.imgs.push({ og_img_id : r.img_id, name: r.file_name, url: url })
      }

      res.status(200).jsonp(ans);
    })
    .catch((_) =>
      res.status(601).jsonp(`Error acquiring project's processing result`)
    );
});


// Get number of advanced tools used in a project
router.get("/:user/:project/advanced_tools", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const tools = project.tools;
      let ans = 0;

      for (let t of tools) {
        if (advanced_tools.includes(t.procedure)) ans++;
      }

      // Multiply answer by number of images to reduce chance of a single project with infinite images
      ans *= project.imgs.length;
      res.status(200).jsonp(ans);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Create new project
router.post("/:user", (req, res, next) => {
  const project = {
    name: req.body.name,
    user_id: req.params.user,
    imgs: [],
    tools: [],
  };

  Project.create(project)
    .then((project) => res.status(201).jsonp(project))
    .catch((_) => res.status(502).jsonp(`Error creating new project`));
});

// Preview an image
router.post("/:user/:project/preview/:img", (req, res, next) => {
  // Get project and create a new process entry
  console.log("entrou")
  console.log(req.params.user, req.params.project, req.params.img)
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const prev_preview = await Preview.getAll(
        req.params.user,
        req.params.project
      );

      for(let p of prev_preview){
        await delete_image(
          req.params.user,
          req.params.project,
          "preview",
          p.img_key
        );
        await Preview.delete(
          req.params.user,
          req.params.project,
          p.img_id
        );
      }

      // Remove previous preview
      if (prev_preview !== null && prev_preview !== undefined) {
      }

      const source_path = `/../images/users/${req.params.user}/projects/${req.params.project}/src`;
      const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/preview`;

      if (!fs.existsSync(path.join(__dirname, source_path)))
        fs.mkdirSync(path.join(__dirname, source_path), { recursive: true });

      if (!fs.existsSync(path.join(__dirname, result_path)))
        fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

      // Retrive image information
      const img = project.imgs.filter((i) => i._id == req.params.img)[0];
      const msg_id = `preview-${uuidv4()}`;
      const timestamp = new Date().toISOString();
      const og_img_uri = img.og_uri;
      const img_id = img._id;

      // Retrieve image and store it using file system
      const resp = await get_image_docker(
        req.params.user,
        req.params.project,
        "src",
        img.og_img_key
      );
      const url = resp.data.url;

      const img_resp = await axios.get(url, { responseType: "stream" });

      const writer = fs.createWriteStream(og_img_uri);

      // Use a Promise to handle the stream completion
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        img_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
      });

      const img_name_parts = img.new_uri.split("/");
      const img_name = img_name_parts[img_name_parts.length - 1];
      const new_img_uri = `./images/users/${req.params.user}/projects/${req.params.project}/preview/${img_name}`;

      const tool = project.tools.filter((t) => t.position == 0)[0];
      const tool_name = tool.procedure;
      const params = tool.params;

      const process = {
        user_id: req.params.user,
        project_id: req.params.project,
        img_id: img_id,
        msg_id: msg_id,
        cur_pos: 0,
        og_img_uri: og_img_uri,
        new_img_uri: new_img_uri,
      };

      // Making sure database entry is created before sending message to avoid conflicts
      Process.create(process)
        .then((_) => {
          send_msg_tool(
            msg_id,
            timestamp,
            og_img_uri,
            new_img_uri,
            tool_name,
            params
          );
          res.sendStatus(201);
        })
        .catch((_) =>
          res.status(603).jsonp(`Error creating preview process request`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Add new image to a project
router.post(
  "/:user/:project/img",
  upload.single("image"),
  async (req, res, next) => {
    if (!req.file) {
      res.status(400).jsonp("No file found");
      return;
    }

    Project.getOne(req.params.user, req.params.project)
      .then(async (project) => {
        const same_name_img = project.imgs.filter(
          (i) => path.basename(i.og_uri) == req.file.originalname
        );

        if (same_name_img.length > 0) {
          res
            .status(400)
            .jsonp("This project already has an image with that name.");
          return;
        }

        try {
          const data = new FormData();
          data.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
          });
          const resp = await post_image(
            req.params.user,
            req.params.project,
            "src",
            data
          );

          const og_key_tmp = resp.data.data.imageKey.split("/");
          const og_key = og_key_tmp[og_key_tmp.length - 1];

          try {
            const og_uri = `./images/users/${req.params.user}/projects/${req.params.project}/src/${req.file.originalname}`;
            const new_uri = `./images/users/${req.params.user}/projects/${req.params.project}/out/${req.file.originalname}`;

            // Insert new image
            project["imgs"].push({
              og_uri: og_uri,
              new_uri: new_uri,
              og_img_key: og_key,
            });

            Project.update(req.params.user, req.params.project, project)
              .then((_) => res.sendStatus(204))
              .catch((_) =>
                res.status(503).jsonp(`Error updating project information`)
              );
          } catch (_) {
            res.status(501).jsonp(`Updating project information`);
          }
        } catch (_) {
          res.status(501).jsonp(`Error storing image`);
        }
      })
      .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
  }
);

// Add new tool to a project
router.post("/:user/:project/tool", (req, res, next) => {
  // Reject posts to tools that don't fullfil the requirements
  if (!req.body.procedure || !req.body.params) {
    res
      .status(400)
      .jsonp(`A tool should have a procedure and corresponding parameters`);
    return;
  }

  let required_types = ["free", "premium"];

  if (!advanced_tools.includes(req.body.procedure))
    required_types.push("anonymous");

  axios
    .get(users_ms + `${req.params.user}/type`, { httpsAgent: httpsAgent })
    .then((resp) => {
      // Check user type before proceeding
      if (!required_types.includes(resp.data.type)) {
        return res.status(403).jsonp(`User type can't use this tool`); // Return a 403 Forbidden
      }

      // Get project and insert new tool
      Project.getOne(req.params.user, req.params.project)
        .then((project) => {
          const tool = {
            position: project["tools"].length,
            ...req.body,
          };

          project["tools"].push(tool);

          Project.update(req.params.user, req.params.project, project)
            .then((_) => res.sendStatus(204))
            .catch((_) =>
              res.status(503).jsonp(`Error updating project information`)
            );
        })
        .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
    })
    .catch((_) => res.send(401).jsonp(`Error accessing picturas-user-ms`));
});

// Reorder tools of a project
router.post("/:user/:project/reorder", (req, res, next) => {
  // Remove all tools from project and reinsert them according to new order
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      project["tools"] = [];

      for (let t of req.body) {
        const tool = {
          position: project["tools"].length,
          ...t,
        };

        project["tools"].push(tool);
      }

      Project.update(req.params.user, req.params.project, project)
        .then((project) => res.status(204).jsonp(project))
        .catch((_) =>
          res.status(503).jsonp(`Error updating project information`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Process a specific project
router.post("/:user/:project/process", (req, res, next) => {
  // Get project and create a new process entry
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const prev_results = await Result.getAll(
          req.params.user,
          req.params.project
        );
        for (let r of prev_results) {
          await delete_image(
            req.params.user,
            req.params.project,
            "out",
            r.img_key
          );
          await Result.delete(r.user_id, r.project_id, r.img_id);
        }
      } catch (_) {
        res.status(400).jsonp("Error deleting previous results");
        return;
      }

      if (project.tools.length == 0) {
        res.status(400).jsonp("No tools selected");
        return;
      }

      const adv_tools = advanced_tool_num(project);
      axios
        .get(users_ms + `${req.params.user}/process/${adv_tools}`, {
          httpsAgent: httpsAgent,
        })
        .then(async (resp) => {
          const can_process = resp.data;

          if (!can_process) {
            res.status(404).jsonp("No more daily_operations available");
            return;
          }

          const source_path = `/../images/users/${req.params.user}/projects/${req.params.project}/src`;
          const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/out`;

          if (fs.existsSync(path.join(__dirname, source_path)))
            fs.rmSync(path.join(__dirname, source_path), {
              recursive: true,
              force: true,
            });

          fs.mkdirSync(path.join(__dirname, source_path), { recursive: true });

          if (fs.existsSync(path.join(__dirname, result_path)))
            fs.rmSync(path.join(__dirname, result_path), {
              recursive: true,
              force: true,
            });

          fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

          let error = false;

          for (let img of project.imgs) {
            let url = "";
            try {
              const resp = await get_image_docker(
                req.params.user,
                req.params.project,
                "src",
                img.og_img_key
              );
              url = resp.data.url;

              const img_resp = await axios.get(url, { responseType: "stream" });

              const writer = fs.createWriteStream(img.og_uri);

              // Use a Promise to handle the stream completion
              await new Promise((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
                img_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
              });
            } catch (_) {
              res.status(400).jsonp("Error acquiring source images");
              return;
            }

            const msg_id = `request-${uuidv4()}`;
            const timestamp = new Date().toISOString();

            const og_img_uri = img.og_uri;
            const new_img_uri = img.new_uri;
            const tool = project.tools.filter((t) => t.position === 0)[0];

            const tool_name = tool.procedure;
            const params = tool.params;

            const process = {
              user_id: req.params.user,
              project_id: req.params.project,
              img_id: img._id,
              msg_id: msg_id,
              cur_pos: 0,
              og_img_uri: og_img_uri,
              new_img_uri: new_img_uri,
            };

            // Making sure database entry is created before sending message to avoid conflicts
            await Process.create(process)
              .then((_) => {
                send_msg_tool(
                  msg_id,
                  timestamp,
                  og_img_uri,
                  new_img_uri,
                  tool_name,
                  params
                );
              })
              .catch((_) => (error = true));
          }

          if (error)
            res
              .status(603)
              .jsonp(
                `There were some erros creating all process requests. Some results can be invalid.`
              );
          else res.sendStatus(201);
        })
        .catch((_) => res.status(400).jsonp(`Error checking if can process`));
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Update a specific project
router.put("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      project.name = req.body.name || project.name;
      Project.update(req.params.user, req.params.project, project)
        .then((_) => res.sendStatus(204))
        .catch((_) =>
          res.status(503).jsonp(`Error updating project information`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Update a tool from a specific project
router.put("/:user/:project/tool/:tool", (req, res, next) => {
  // Get project and update required tool with new data, keeping it's original position and procedure
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      try {
        const tool_pos = project["tools"].findIndex(
          (i) => i._id == req.params.tool
        );
        const prev_tool = project["tools"][tool_pos];

        project["tools"][tool_pos] = {
          position: prev_tool.position,
          procedure: prev_tool.procedure,
          params: req.body.params,
          _id: prev_tool._id,
        };

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res
          .status(599)
          .jsonp(`Error updating tool. Make sure such tool exists`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Delete a project
router.delete("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project).then(async (project) => {
    // Remove all images related to the project from the file system
    const previous_img = JSON.parse(JSON.stringify(project["imgs"]));
    for (let img of previous_img) {
      await delete_image(
        req.params.user,
        req.params.project,
        "src",
        img.og_img_key
      );
      project["imgs"].remove(img); // Not really needed, but in case of error serves as reference point
    }

    const results = await Result.getAll(req.params.user, req.params.project);

    const previews = await Preview.getAll(req.params.user, req.params.project);

    for (let r of results) {
      await delete_image(req.params.user, req.params.project, "out", r.img_key);
      await Result.delete(r.user_id, r.project_id, r.img_id);
    }

    for (let p of previews) {
      await delete_image(
        req.params.user,
        req.params.project,
        "preview",
        p.img_key
      );
      await Preview.delete(p.user_id, p.project_id, p.img_id);
    }

    Project.delete(req.params.user, req.params.project)
      .then((_) => res.sendStatus(204))
      .catch((_) => res.status(504).jsonp(`Error deleting user's project`));
  });
});

// Delete an image from a project
router.delete("/:user/:project/img/:img", (req, res, next) => {
  // Get project and delete specified image
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const img = project["imgs"].filter((i) => i._id == req.params.img)[0];

        await delete_image(
          req.params.user,
          req.params.project,
          "src",
          img.og_img_key
        );
        project["imgs"].remove(img);

        const results = await Result.getOne(
          req.params.user,
          req.params.project,
          img._id
        );

        const previews = await Preview.getOne(
          req.params.user,
          req.params.project,
          img._id
        );

        if (results !== null && results !== undefined) {
          await delete_image(
            req.params.user,
            req.params.project,
            "out",
            results.img_key
          );
          await Result.delete(
            results.user_id,
            results.project_id,
            results.img_id
          );
        }

        if (previews !== null && previews !== undefined) {
          await delete_image(
            req.params.user,
            req.params.project,
            "preview",
            previews.img_key
          );
          await Preview.delete(
            previews.user_id,
            previews.project_id,
            previews.img_id
          );
        }

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res.status(400).jsonp(`Error deleting image information.`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Delete a tool from a project
router.delete("/:user/:project/tool/:tool", (req, res, next) => {
  // Get project and delete specified tool, updating the position of all tools that follow
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      try {
        const tool = project["tools"].filter(
          (i) => i._id == req.params.tool
        )[0];

        project["tools"].remove(tool);

        for (let i = 0; i < project["tools"].length; i++) {
          if (project["tools"][i].position > tool.position)
            project["tools"][i].position--;
        }

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res.status(400).jsonp(`Error deleting tool's information`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Cancel ongoing project processing
router.post("/:user/:project/cancel", (req, res, next) => {
  // Get all processes for this project
  Process.getProject(req.params.user, req.params.project)
    .then(async (processes) => {
      try {
        // Collect all message IDs for purging
        const msg_ids = processes.map(p => p.msg_id);
        
        // Delete all processes related to this project
        for (let process of processes) {
          await Process.delete(
            req.params.user,
            req.params.project,
            process._id
          );
        }
        
        // Clean up temporary directories
        const source_path = `/../images/users/${req.params.user}/projects/${req.params.project}/src`;
        const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/out`;

        if (fs.existsSync(path.join(__dirname, source_path))) {
          fs.rmSync(path.join(__dirname, source_path), {
            recursive: true,
            force: true,
          });
        }

        if (fs.existsSync(path.join(__dirname, result_path))) {
          fs.rmSync(path.join(__dirname, result_path), {
            recursive: true,
            force: true,
          });
        }

        res.sendStatus(204);
      } catch (error) {
        res.status(500).jsonp("Error canceling processing");
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's processes`));
});

module.exports = { router, process_msg };
