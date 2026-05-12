import { MServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MongoClient } from "mongodb";
import { z } from "zod"; // comparer les types
import express from "express";

const MONGO_URI = "mongodb+srv://admin_db:adminusers@cluster0.hojwogl.mongodb.net/?appName=Cluster0";
const client = new MongoClient(MONGO_URI);
await client.connect(); 
const db = mongoClient.db("db");
const contacts = db.collection("users");
console.log("✅ Connecté à MongoDB");


const server = new MServer(
  { name: "mcp-carnet-adresses", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.tool(
  "ajouter_utilisateur",
  "Ajoute un nouveau contact professionnel dans le carnet d'adresses.",
    {
            nom: z.string().describe("Nom complet"),
            age: z.number().describe("Âge en années" ),
            profession: z.string().describe("Intitulé du poste"),
            bio: z.string().describe("Courte biographie descriptive"),
            competences: z.array(z.string()).optional().describe("Liste des compétences clés"),
            localisation: z.string().optional().describe("Ville et pays")
          },
          async (contact) => {
            const result = await contacts.insertOne({
                    ...contact,
                    createdAt: new Date(),
            })
            return {
              content: [{
                type: "text", text: `✅"${contact.nom}" a été ajouté (ID: ${result.insertedId})`
              }]
            }
          }
)

const app = express();
app.use(express.json());

app.get("/stream", async (req, res) => {
  if(transport){
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

});

app.post("/stream", async (req, res) => {
  if(transport){
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
});


const PORT = 3000 || 3001;
app.listen(PORT, () => {
  console.log(`🚀 MCP Carnet d'adresses sur http://localhost:${PORT}/stream`);
});