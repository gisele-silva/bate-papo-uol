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
    type: joi.string().valid("message").required(),
    time: joi.number()
})

const participantSchema = joi.object({
    name: joi.string().min(1).required()
})

app.post("/participants", async (req, res) => {
    const participante = req.body;
    const { name } = req.body
    const validation = participantSchema.validate(participante, {abortEarly: false})
    
    if (validation.error){
        const erro = validation.error.details.map((detail) => detail.message)
        res.status(422).send(erro)
        return 
    }

    try {
        const userExist = await db.collection("participants").findOne({name})
        if(userExist){
        res.status(409).send({error: "usuário já cadastrado"})
        return 
        }

        if (name === "") {
            return res.status(422).send({error: "preencher todos os campos"})
        }

        await db.collection("participants").insertOne({
            name: participante.name, 
            lastStatus: Date.now()
        })

        await db.collection("messages").insertOne({
            from: name,
            to: "todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss")
        })
        res.sendStatus(201);
    } catch (error) {
        res.status(500).send(error.message)
    }

    // const userExist = db.collection("participants").findOne({name})
     
    // if(userExist){
    //     return res.status(409).send({error: "usuário já cadastrado"})
    // }  
 
    // return res.sendStatus(201)
})

app.get("/participants", async (req, res) => {

    try {
        const user = await db.collection("participants").find().toArray()
        if(!user){
            res.status(404).send("usuário não logado")
            return
        }
        res.send(user)
    } catch (error) {
        return res.status(500).send(error.message)   
    }
})

app.post("/messages", async (req, res) => {
    const {to, text, type} = req.body
    const { user } = req.headers

    try {
        const message = {
            from: user,
            to,
            text,
            type,
            time: dayjs().format("HH:mm:ss")
        }

          const validation = messageSchema.validate(message, {abortEarly: false,});

        if (validation.error){
            const erro = validation.error.details.map((detail) => detail.message)
            res.status(422).send(erro)
            return 
        }

        const userExist = await db.collection("participants").findOne({name: user})

        if(!userExist){
            res.sendStatus(409)
            return
        }

        await db.collection("messages").insertOne(message)
        res.send(201)
    } catch (error) {
        res.status(500).send(error.message)
    }   
})

app.get("/messages", async (req, res) => {
    const limit = parseInt(req.query.limit)
    const {user} = req.headers

    try {
        const mensagem = await db.collection("messages").find().toArray()
        const buscaMensagem = mensagem.filter((message) => { 
            const mensagemPrivada = message.to==="todos" || message.to===user || message.from===user
            const mensagemPublica = message.type === "message"

            return mensagemPrivada || mensagemPublica
        });

        // if (limit && limit !== NaN){
        //     return res.send(buscaMensagem.slice(-limit));
        // }
        res.send(buscaMensagem.slice(-limit));
    } catch (error) {
        res.status(500).send(error.message)
    }
})

app.post("/status", async (req, res) => {
    const { user } = req.headers

    try {
        const userExist = await db.collection("participants").findOne({name: user})
        if (!userExist){
            res.status(404).send("usuário não logado")
            return 
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
            const mensagensInativas = participantesInativos.map(participantesInativos => {
                return {
                        from: participantesInativos.name,
                        to: "Todos",
                        text: "saiu da sala",
                        type: "status",
                        time: dayjs().format("HH:mm:ss")
                }
            })
            await db.collection("messages").insertMany(mensagensInativas)
            await db.collection("participants").deleteMany({lastStatus: {$lte: tempo}})
        }
        
        
    } catch (error) {
        res.status(500).send(error.message)
    }
}, 15000);

const PORT = 5000;
app.listen(PORT, () => console.log("ok"))