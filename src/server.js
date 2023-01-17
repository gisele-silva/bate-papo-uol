import express from "express"
import cors from "cors"
import { MongoClient } from "mongodb"
import dotenv from 'dotenv'
import joi from "joi"
import dayjs from "dayjs"

dotenv.config()

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;
try {
    await mongoClient.connect()
    db = mongoClient.db() 
    console.log("conectado ao servidor com sucesso")
} catch (error) {
    console.log("Erro ao conectar o servidor")
}

const app = express()
app.use(express.json())
app.use(cors())

const messageSchema = joi.object({
    from: joi.string().required(),
    to: joi.string().min(1).required(),
    text: joi.string().min(1).required(),
    type: joi.string().valid("message", "private_message").required(),
    time: joi.string()
})

const participantSchema = joi.object({
    name: joi.string().min(1).required()
})

app.post("/participants", async (req, res) => {
    const participante = req.body;
    const { name } = req.body
    const validation = participantSchema.validate({name}, {abortEarly: false})
    
    if (validation.error){
        const erro = validation.error.details.map((detail) => detail.message)
        return res.status(422).send(erro) 
    }

    try {
        const userExist = await db.collection("participants").findOne({name})
        if(userExist){
            return res.status(409).send({error: "usuário já cadastrado"})
        }

        await db.collection("participants").insertOne({name, lastStatus: Date.now()})

        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss")
        })

        res.sendStatus(201);
    } catch (error) {
        res.status(500).send(error.message)
    }
})

app.get("/participants", async (req, res) => {

    try {
        const user = await db.collection("participants").find().toArray()
        if(!user){
            return res.status(404).send("usuário não logado")   
        }
        res.send(user)
    } catch (error) {
        return res.status(500).send(error.message)   
    }
})

app.post("/messages", async (req, res) => {
const { to, text, type } = req.body;
  const { user } = req.headers;

  const message = {
    from: user,
    to,
    text,
    type,
    time: dayjs().format("HH:mm:ss"),
  };

  try {
    const { error } = messageSchema.validate(message, { abortEarly: false });

    if (error) {
      const erro = error.details.map((detail) => detail.message);
      return res.status(422).send(erro);
    }

    await db.collection("messages").insertOne(message);

    res.sendStatus(201);
  } catch (err) {
    console.log(err);
    res.sendStatus(500);
  }
})

app.get("/messages", async (req, res) => {
    const limit = parseInt(req.query.limit)
    const {user} = req.headers

    try {
        const message = await db.collection("messages").find().toArray()
        const buscaMessage = message.filter((message) => { 
            const messagePrivada = message.to==="todos" || message.to===user || message.from===user
            const messagePublica = message.type === "message"

            return messagePrivada || messagePublica
        });

        if (limit && limit !== NaN){
          return res.send(buscaMessage.slice(-limit));
        }

        res.send(buscaMessage);
    } catch (error) {
        res.status(500).send(error.message)
    }
})

app.post("/status", async (req, res) => {
    const { user } = req.headers

    try {
        const userExist = await db.collection("participants").findOne({name: user})
        if (!userExist){
            return res.status(404).send("usuário não logado")
        }

        await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now()}})
        res.sendStatus(200)
    } catch (error) {
        res.status(500).send(error.message)
    }
})

setInterval(async () => {
    console.log("removendo os inativos")
    const tempo = Date.now() - 10*1000;

    try {
        const participantesInativos = await db.collection("participants").find({lastStatus: {$lte: tempo}}).toArray()

        if (participantesInativos.length > 0){
            const mensagensInativas = participantesInativos.map((participant) => {
                return {
                  from: participant.name,
                  to: "Todos",
                  text: "sai da sala...",
                  type: "status",
                  time: dayjs().format("HH:mm:ss"),
                };
              });
            await db.collection("messages").insertMany(mensagensInativas)
            await db.collection("participants").deleteMany({lastStatus: {$lte: tempo}})
        }
        
        
    } catch (error) {
        res.status(500).send(error.message)
    }
}, 15000);

const PORT = 5000;
app.listen(PORT, () => console.log("ok"))